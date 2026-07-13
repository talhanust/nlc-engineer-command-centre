/**
 * Content hash of an imported file, for provenance.
 *
 * A claim must be able to prove WHICH file produced WHICH baseline, so the hash
 * travels with the schedule. SHA-256 via Web Crypto where available — note that
 * `crypto.subtle` is undefined on insecure origins (plain http), which is exactly
 * where a hash silently becoming something weaker would be most dangerous. So the
 * fallback is labelled: the stored record always says which algorithm produced it,
 * and never claims to be SHA-256 when it isn't.
 */
export interface FileHash {
  hash: string;
  algorithm: 'sha-256' | 'fnv-1a';
}

export async function hashBytes(buf: ArrayBuffer): Promise<FileHash> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof subtle.digest === 'function') {
    try {
      const digest = await subtle.digest('SHA-256', buf);
      return { hash: toHex(new Uint8Array(digest)), algorithm: 'sha-256' };
    } catch {
      // fall through to the labelled fallback
    }
  }
  return { hash: fnv1a(new Uint8Array(buf)), algorithm: 'fnv-1a' };
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/** 64-bit FNV-1a as two 32-bit halves. Not cryptographic — only ever used with
 *  an explicit 'fnv-1a' label so no one mistakes it for a SHA-256 digest. */
function fnv1a(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const b of bytes) {
    h1 ^= b;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= b + 0x9e;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/** "a3f1…9c2e" — enough to compare by eye, with the full value in a tooltip. */
export function shortHash(hash: string): string {
  return hash.length <= 12 ? hash : `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}
