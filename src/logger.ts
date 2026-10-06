/**
 * Lightweight structured logger.
 *
 *  - JSONL files in DATA_DIR/logs (one file per day, split into parts when large)
 *  - Writes are batched and flushed once per second (minimal disk IO)
 *  - Automatic pruning by retention days and total size budget
 *  - In-memory ring buffer + subscriber API for the dashboard's live tail
 *  - Captures console.* output so existing log statements show up in the dashboard
 */
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  cat: string;
  msg: string;
  meta?: Record<string, unknown>;
}

export interface LoggerOptions {
  dataDir: string;
  level: LogLevel;
  retentionDays: number;
  maxSizeMb: number;
  /** In stdio mode stdout is the MCP channel — echo to stderr only. */
  stdio?: boolean;
}

const RING_SIZE = 2000;
const FILE_RE = /^webbridge-(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.log$/;

const origConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

class Logger {
  private opts: LoggerOptions | null = null;
  private ring: LogEntry[] = [];
  private seq = 0;
  private subscribers = new Set<(e: LogEntry) => void>();
  private pending: string[] = [];
  private stream: WriteStream | null = null;
  private streamDay = '';
  private streamPart = 0;
  private streamBytes = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private maintTimer: ReturnType<typeof setInterval> | null = null;
  private counts: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };

  get logDir(): string {
    return join(this.opts?.dataDir || join(process.cwd(), 'data'), 'logs');
  }

  init(opts: LoggerOptions): void {
    this.opts = opts;
    try { mkdirSync(this.logDir, { recursive: true }); } catch { /* ignore */ }
    this.patchConsole();
    this.flushTimer = setInterval(() => this.flush(), 1000);
    this.flushTimer.unref();
    this.maintTimer = setInterval(() => this.maintenance(), 10 * 60 * 1000);
    this.maintTimer.unref();
    this.maintenance();
    process.once('beforeExit', () => this.flush());
  }

  configure(partial: Partial<Pick<LoggerOptions, 'level' | 'retentionDays' | 'maxSizeMb'>>): void {
    if (!this.opts) return;
    Object.assign(this.opts, partial);
    this.maintenance();
  }

  get level(): LogLevel { return this.opts?.level ?? 'info'; }

  debug(cat: string, msg: string, meta?: Record<string, unknown>) { this.write('debug', cat, msg, meta); }
  info(cat: string, msg: string, meta?: Record<string, unknown>) { this.write('info', cat, msg, meta); }
  warn(cat: string, msg: string, meta?: Record<string, unknown>) { this.write('warn', cat, msg, meta); }
  error(cat: string, msg: string, meta?: Record<string, unknown>) { this.write('error', cat, msg, meta); }

  /** Write an entry. `echo` = also print to the real console (false for captured console calls). */
  write(level: LogLevel, cat: string, msg: string, meta?: Record<string, unknown>, echo = true): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.level]) return;
    const entry: LogEntry = { id: ++this.seq, ts: Date.now(), level, cat, msg: String(msg).slice(0, 8000) };
    if (meta && Object.keys(meta).length) entry.meta = meta;

    this.counts[level]++;
    this.ring.push(entry);
    if (this.ring.length > RING_SIZE) this.ring.splice(0, this.ring.length - RING_SIZE);

    if (echo) {
      const line = `[${new Date(entry.ts).toISOString()}] ${level.toUpperCase()} [${cat}] ${entry.msg}${entry.meta ? ' ' + safeJson(entry.meta) : ''}`;
      if (this.opts?.stdio || level === 'error' || level === 'warn') origConsole.error(line);
      else origConsole.log(line);
    }

    if (this.opts) this.pending.push(JSON.stringify(entry));
    for (const fn of this.subscribers) {
      try { fn(entry); } catch { /* ignore subscriber errors */ }
    }
  }

  subscribe(fn: (e: LogEntry) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  recent(filter: { level?: LogLevel; cat?: string; q?: string; limit?: number; afterId?: number } = {}): LogEntry[] {
    const minRank = filter.level ? LEVEL_RANK[filter.level] : 0;
    const q = filter.q?.toLowerCase();
    const out: LogEntry[] = [];
    for (let i = this.ring.length - 1; i >= 0; i--) {
      const e = this.ring[i];
      if (filter.afterId && e.id <= filter.afterId) break;
      if (LEVEL_RANK[e.level] < minRank) continue;
      if (filter.cat && e.cat !== filter.cat) continue;
      if (q && !e.msg.toLowerCase().includes(q) && !(e.meta && safeJson(e.meta).toLowerCase().includes(q))) continue;
      out.push(e);
      if (out.length >= (filter.limit ?? 500)) break;
    }
    return out.reverse();
  }

  categories(): string[] {
    return [...new Set(this.ring.map(e => e.cat))].sort();
  }

  stats() {
    return { counts: { ...this.counts }, buffered: this.ring.length, subscribers: this.subscribers.size };
  }

  clearMemory(): void {
    this.ring = [];
    this.counts = { debug: 0, info: 0, warn: 0, error: 0 };
  }

  // ── Files ───────────────────────────────────────────────

  listFiles(): Array<{ name: string; size: number; modified: number; active: boolean }> {
    if (!existsSync(this.logDir)) return [];
    const active = this.currentFileName();
    return readdirSync(this.logDir)
      .filter(n => FILE_RE.test(n))
      .map(name => {
        const st = statSync(join(this.logDir, name));
        return { name, size: st.size, modified: st.mtimeMs, active: name === active };
      })
      .sort((a, b) => b.modified - a.modified);
  }

  isValidFileName(name: string): boolean {
    return FILE_RE.test(name);
  }

  deleteFile(name: string): void {
    if (!FILE_RE.test(name)) throw new Error('Invalid log file name');
    if (name === this.currentFileName()) this.closeStream();
    const p = join(this.logDir, name);
    if (existsSync(p)) unlinkSync(p);
  }

  deleteAll(): number {
    this.flush();
    this.closeStream();
    let n = 0;
    for (const f of this.listFiles()) {
      try { unlinkSync(join(this.logDir, f.name)); n++; } catch { /* ignore */ }
    }
    this.clearMemory();
    return n;
  }

  totalSize(): number {
    return this.listFiles().reduce((s, f) => s + f.size, 0);
  }

  flush(): void {
    if (!this.pending.length || !this.opts) return;
    const day = new Date().toISOString().slice(0, 10);
    const partLimit = Math.max(1, this.opts.maxSizeMb * 1024 * 1024 / 4);
    if (!this.stream || this.streamDay !== day || this.streamBytes > partLimit) {
      this.rotate(day);
    }
    const chunk = this.pending.join('\n') + '\n';
    this.pending = [];
    this.streamBytes += Buffer.byteLength(chunk);
    this.stream!.write(chunk);
  }

  private currentFileName(): string {
    if (!this.streamDay) return '';
    return `webbridge-${this.streamDay}${this.streamPart ? '.' + this.streamPart : ''}.log`;
  }

  private rotate(day: string): void {
    this.closeStream();
    try { mkdirSync(this.logDir, { recursive: true }); } catch { /* ignore */ }
    const partLimit = Math.max(1, (this.opts?.maxSizeMb ?? 50) * 1024 * 1024 / 4);
    let part = this.streamDay === day ? this.streamPart + 1 : 0;
    // Resume today's newest part after a restart if it still has room
    if (this.streamDay !== day) {
      const parts = this.listFiles().filter(f => f.name.includes(day)).map(f => Number(FILE_RE.exec(f.name)?.[2] || 0));
      part = parts.length ? Math.max(...parts) : 0;
    }
    let name = `webbridge-${day}${part ? '.' + part : ''}.log`;
    let size = existsSync(join(this.logDir, name)) ? statSync(join(this.logDir, name)).size : 0;
    if (size > partLimit) { part++; name = `webbridge-${day}.${part}.log`; size = 0; }
    this.streamDay = day;
    this.streamPart = part;
    this.streamBytes = size;
    this.stream = createWriteStream(join(this.logDir, name), { flags: 'a' });
    this.stream.on('error', (err) => origConsole.error('[logger] write error:', err.message));
  }

  private closeStream(): void {
    if (this.stream) {
      try { this.stream.end(); } catch { /* ignore */ }
      this.stream = null;
    }
  }

  /** Delete files beyond retention or total size budget (oldest first). */
  maintenance(): { deleted: string[] } {
    const deleted: string[] = [];
    if (!this.opts) return { deleted };
    const cutoff = Date.now() - this.opts.retentionDays * 86400_000;
    const files = this.listFiles(); // newest first
    let total = 0;
    const budget = this.opts.maxSizeMb * 1024 * 1024;
    for (const f of files) {
      total += f.size;
      if (f.active) continue;
      if (f.modified < cutoff || total > budget) {
        try { unlinkSync(join(this.logDir, f.name)); deleted.push(f.name); total -= f.size; } catch { /* ignore */ }
      }
    }
    return { deleted };
  }

  // ── Console capture ─────────────────────────────────────

  private patchConsole(): void {
    const capture = (level: LogLevel, orig: (...a: unknown[]) => void) => (...args: unknown[]) => {
      orig(...args);
      const msg = args.map(a => (typeof a === 'string' ? a : a instanceof Error ? (a.stack || a.message) : safeJson(a))).join(' ');
      this.write(level, 'console', msg, undefined, false);
    };
    console.log = capture('info', origConsole.log);
    console.info = capture('info', origConsole.info);
    console.warn = capture('warn', origConsole.warn);
    console.error = capture('error', origConsole.error);
    console.debug = capture('debug', origConsole.debug);
  }
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

export const logger = new Logger();
