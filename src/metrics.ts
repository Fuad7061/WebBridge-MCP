/**
 * Tool-call metrics. Persisted to DATA_DIR/stats.json (debounced) so
 * lifetime counters survive restarts and redeploys.
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

interface ToolStat { calls: number; errors: number; totalMs: number; maxMs: number; lastAt: number }

interface RecentCall { ts: number; tool: string; ok: boolean; ms: number; source: string; error?: string }

interface StatsFile {
  since: number;
  totalCalls: number;
  totalErrors: number;
  tools: Record<string, ToolStat>;
}

const MINUTES = 60;

class Metrics {
  private file = '';
  private data: StatsFile = { since: Date.now(), totalCalls: 0, totalErrors: 0, tools: {} };
  private dirty = false;
  private recentCalls: RecentCall[] = [];
  /** calls per minute for the last hour: [minuteEpoch, calls, errors] */
  private timeline = new Map<number, { calls: number; errors: number }>();
  readonly bootAt = Date.now();
  private sessionCalls = 0;
  private sessionErrors = 0;

  init(dataDir: string): void {
    this.file = join(dataDir, 'stats.json');
    if (existsSync(this.file)) {
      try { this.data = { ...this.data, ...JSON.parse(readFileSync(this.file, 'utf-8')) }; } catch { /* ignore corrupt */ }
    }
    const t = setInterval(() => this.save(), 60_000);
    t.unref();
    process.once('beforeExit', () => this.save());
  }

  record(tool: string, ok: boolean, ms: number, source: string, error?: string): void {
    const s = this.data.tools[tool] ||= { calls: 0, errors: 0, totalMs: 0, maxMs: 0, lastAt: 0 };
    s.calls++; s.totalMs += ms; s.maxMs = Math.max(s.maxMs, ms); s.lastAt = Date.now();
    this.data.totalCalls++; this.sessionCalls++;
    if (!ok) { s.errors++; this.data.totalErrors++; this.sessionErrors++; }
    this.dirty = true;

    this.recentCalls.push({ ts: Date.now(), tool, ok, ms, source, error: error?.slice(0, 300) });
    if (this.recentCalls.length > 100) this.recentCalls.shift();

    const minute = Math.floor(Date.now() / 60_000);
    const b = this.timeline.get(minute) || { calls: 0, errors: 0 };
    b.calls++; if (!ok) b.errors++;
    this.timeline.set(minute, b);
    for (const k of this.timeline.keys()) if (k < minute - MINUTES) this.timeline.delete(k);
  }

  snapshot() {
    const nowMin = Math.floor(Date.now() / 60_000);
    const timeline = [];
    for (let m = nowMin - MINUTES + 1; m <= nowMin; m++) {
      const b = this.timeline.get(m) || { calls: 0, errors: 0 };
      timeline.push({ t: m * 60_000, ...b });
    }
    const tools = Object.entries(this.data.tools)
      .map(([name, s]) => ({ name, ...s, avgMs: s.calls ? Math.round(s.totalMs / s.calls) : 0 }))
      .sort((a, b) => b.calls - a.calls);
    return {
      since: this.data.since,
      lifetime: { calls: this.data.totalCalls, errors: this.data.totalErrors },
      session: { calls: this.sessionCalls, errors: this.sessionErrors, since: this.bootAt },
      tools,
      timeline,
      recent: [...this.recentCalls].reverse(),
    };
  }

  reset(): void {
    this.data = { since: Date.now(), totalCalls: 0, totalErrors: 0, tools: {} };
    this.recentCalls = [];
    this.timeline.clear();
    this.sessionCalls = 0; this.sessionErrors = 0;
    this.dirty = true;
    this.save();
  }

  save(): void {
    if (!this.dirty || !this.file) return;
    try {
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data));
      renameSync(`${this.file}.tmp`, this.file);
      this.dirty = false;
    } catch { /* ignore */ }
  }
}

export const metrics = new Metrics();
