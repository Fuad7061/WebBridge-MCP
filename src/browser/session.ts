import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionStore, AppConfig } from '../types/index.js';

export function createSessionStore(config: AppConfig): SessionStore {
  const store = new Map<string, string>();
  const filePath = join(config.dataDir, 'session-store.json');

  if (!existsSync(config.dataDir)) {
    mkdirSync(config.dataDir, { recursive: true });
  }

  if (existsSync(filePath)) {
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));
      for (const [k, v] of Object.entries(data)) {
        store.set(k, String(v));
      }
    } catch { /* ignore corrupted session file */ }
  }

  function persist() {
    try {
      const obj: Record<string, string> = {};
      for (const [k, v] of store) obj[k] = v;
      writeFileSync(filePath, JSON.stringify(obj, null, 2));
    } catch { /* ignore write errors */ }
  }

  return {
    get(key: string) { return store.get(key); },
    set(key: string, value: string) { store.set(key, value); persist(); },
    delete(key: string) { store.delete(key); persist(); },
    export() {
      const obj: Record<string, string> = {};
      for (const [k, v] of store) obj[k] = v;
      return obj;
    },
    import(data: Record<string, string>) {
      for (const [k, v] of Object.entries(data)) store.set(k, v);
      persist();
    },
  };
}
