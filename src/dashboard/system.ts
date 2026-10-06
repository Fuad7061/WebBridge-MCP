/**
 * Host / container / process introspection for the dashboard.
 * Linux-specific bits (cgroups, /proc) degrade gracefully on macOS/Windows.
 */
import { readFileSync, existsSync, readdirSync, statSync, promises as fsp } from 'node:fs';
import { join, dirname } from 'node:path';
import os from 'node:os';

let lastCpu = process.cpuUsage();
let lastCpuAt = process.hrtime.bigint();
let cpuPercent = 0;

/** Process CPU% since the previous call (sampled on demand — no background timer). */
function sampleCpu(): number {
  const now = process.hrtime.bigint();
  const elapsedUs = Number(now - lastCpuAt) / 1000;
  if (elapsedUs < 500_000) return cpuPercent; // avoid noisy samples
  const usage = process.cpuUsage(lastCpu);
  cpuPercent = Math.min(100 * os.cpus().length, ((usage.user + usage.system) / elapsedUs) * 100);
  lastCpu = process.cpuUsage();
  lastCpuAt = now;
  return cpuPercent;
}

function readText(p: string): string | null {
  try { return readFileSync(p, 'utf-8').trim(); } catch { return null; }
}

/** Container memory limit/usage via cgroup v2 (fallback v1). */
function cgroupMemory(): { limit: number | null; usage: number | null } {
  const v2Max = readText('/sys/fs/cgroup/memory.max');
  const v2Cur = readText('/sys/fs/cgroup/memory.current');
  if (v2Cur) {
    return { usage: Number(v2Cur), limit: v2Max && v2Max !== 'max' ? Number(v2Max) : null };
  }
  const v1Lim = readText('/sys/fs/cgroup/memory/memory.limit_in_bytes');
  const v1Use = readText('/sys/fs/cgroup/memory/memory.usage_in_bytes');
  if (v1Use) {
    const lim = v1Lim ? Number(v1Lim) : null;
    return { usage: Number(v1Use), limit: lim && lim < 2 ** 60 ? lim : null };
  }
  return { usage: null, limit: null };
}

/** Sum RSS of all descendant processes (Chromium renderers, GPU, etc.). Linux only. */
function childProcessTree(): { count: number; rss: number } | null {
  if (process.platform !== 'linux' || !existsSync('/proc')) return null;
  try {
    const parents = new Map<number, number>();
    const rssMap = new Map<number, number>();
    const pageSize = 4096;
    for (const d of readdirSync('/proc')) {
      if (!/^\d+$/.test(d)) continue;
      const stat = readText(`/proc/${d}/stat`);
      if (!stat) continue;
      // Fields after the "(comm)" section; comm may contain spaces.
      const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      parents.set(Number(d), Number(rest[1]));
      rssMap.set(Number(d), Number(rest[21]) * pageSize);
    }
    const descendants = new Set<number>();
    let frontier = [process.pid];
    while (frontier.length) {
      const next: number[] = [];
      for (const [pid, ppid] of parents) {
        if (frontier.includes(ppid) && !descendants.has(pid)) { descendants.add(pid); next.push(pid); }
      }
      frontier = next;
    }
    let rss = 0;
    for (const pid of descendants) rss += rssMap.get(pid) || 0;
    return { count: descendants.size, rss };
  } catch {
    return null;
  }
}

export function systemInfo() {
  const mem = process.memoryUsage();
  const cg = cgroupMemory();
  return {
    node: process.version,
    platform: `${process.platform} ${os.release()} (${process.arch})`,
    hostname: os.hostname(),
    pid: process.pid,
    uptime: process.uptime(),
    cpus: os.cpus().length,
    loadavg: os.loadavg(),
    cpuPercent: Math.round(sampleCpu() * 10) / 10,
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      systemTotal: os.totalmem(),
      systemFree: os.freemem(),
      containerUsage: cg.usage,
      containerLimit: cg.limit,
    },
    browserProcesses: childProcessTree(),
    containerized: existsSync('/.dockerenv') || !!process.env.COOLIFY_FQDN || !!process.env.COOLIFY_URL || !!process.env.COOLIFY_CONTAINER_NAME,
  };
}

// ── Disk usage ────────────────────────────────────────────

async function dirSize(p: string, depthLimit = 30): Promise<{ bytes: number; files: number }> {
  let bytes = 0, files = 0;
  async function walk(dir: string, depth: number) {
    if (depth > depthLimit) return;
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full, depth + 1);
      else if (e.isFile()) {
        try { bytes += (await fsp.stat(full)).size; files++; } catch { /* ignore */ }
      }
    }
  }
  try {
    const st = await fsp.stat(p);
    if (st.isFile()) return { bytes: st.size, files: 1 };
  } catch { return { bytes: 0, files: 0 }; }
  await walk(p, 0);
  return { bytes, files };
}

let storageCache: { at: number; data: unknown } | null = null;

export function invalidateStorageCache() { storageCache = null; }

/** Is `p` on a different device than its parent (i.e. a mounted volume)? */
function isMountPoint(p: string): boolean | null {
  try {
    if (process.platform === 'linux') {
      const mounts = readText('/proc/self/mountinfo');
      if (mounts) return mounts.split('\n').some(l => l.split(' ')[4] === p);
    }
    return statSync(p).dev !== statSync(dirname(p)).dev;
  } catch { return null; }
}

export async function storageInfo(dataDir: string) {
  if (storageCache && Date.now() - storageCache.at < 15_000) return storageCache.data as Awaited<ReturnType<typeof computeStorage>>;
  const data = await computeStorage(dataDir);
  storageCache = { at: Date.now(), data };
  return data;
}

async function computeStorage(dataDir: string) {
  const known: Array<{ id: string; label: string; path: string; description: string; clearable: boolean }> = [
    { id: 'logs', label: 'Log files', path: join(dataDir, 'logs'), description: 'Application & tool-call logs (JSONL).', clearable: true },
    { id: 'chrome-profile', label: 'Browser profile / cache', path: join(dataDir, 'chrome-profile'), description: 'Chromium profile directory and cache.', clearable: true },
    { id: 'session', label: 'Session store', path: join(dataDir, 'session-store.json'), description: 'Key/value session data saved by tools.', clearable: true },
    { id: 'stats', label: 'Usage statistics', path: join(dataDir, 'stats.json'), description: 'Lifetime tool-call counters.', clearable: true },
    { id: 'settings', label: 'Dashboard settings', path: join(dataDir, 'settings.json'), description: 'Persisted setting overrides & custom env vars.', clearable: false },
  ];
  const items = [];
  let accounted = 0;
  for (const k of known) {
    const s = await dirSize(k.path);
    accounted += s.bytes;
    items.push({ ...k, ...s, exists: existsSync(k.path) });
  }
  const total = await dirSize(dataDir);
  items.push({ id: 'other', label: 'Other files', path: dataDir, description: 'Anything else inside the data directory.', clearable: false, bytes: Math.max(0, total.bytes - accounted), files: 0, exists: true });

  let volume: { total: number; free: number } | null = null;
  try {
    const sf = await fsp.statfs(dataDir);
    volume = { total: sf.blocks * sf.bsize, free: sf.bavail * sf.bsize };
  } catch { /* statfs unsupported */ }

  return { dataDir, totalBytes: total.bytes, totalFiles: total.files, items, volume, persistentMount: isMountPoint(dataDir) };
}
