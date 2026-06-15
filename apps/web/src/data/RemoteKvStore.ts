import type { KvStore } from './LocalDataProvider';

/**
 * KvStore backed by the backend document API (/api/state). It hydrates the
 * whole document set once into an in-memory map (so the synchronous KvStore
 * interface still works), then writes through to the server on every change.
 * This lets api mode reuse the exact same provider logic as the offline demo.
 */
export class RemoteKvStore implements KvStore {
  private map = new Map<string, string>();

  constructor(private baseUrl: string, private user: string) {}

  private headers(json = false): Record<string, string> {
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(this.user ? { 'X-User': this.user } : {}),
    };
  }

  /** Load all documents into memory. Call once before using the provider. */
  async hydrate(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/state`, { headers: this.headers() });
    if (!res.ok) throw new Error(`API ${res.status} hydrating state`);
    const body = (await res.json()) as { docs: Record<string, unknown> };
    this.map.clear();
    for (const [k, v] of Object.entries(body.docs ?? {})) {
      this.map.set(k, JSON.stringify(v));
    }
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
    // Write through (fire-and-forget; the in-memory map is the source of truth
    // for this session, and the server persists asynchronously).
    void fetch(`${this.baseUrl}/api/state/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: this.headers(true),
      body: value, // already-serialised JSON value
    }).catch(() => { /* swallow; surfaced on next hydrate */ });
  }

  removeItem(key: string): void {
    this.map.delete(key);
    void fetch(`${this.baseUrl}/api/state/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: this.headers(),
    }).catch(() => { /* ignore */ });
  }
}
