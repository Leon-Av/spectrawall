/**
 * Params <-> URL hash serialization ("#p=...").
 * Deflate-compressed base64url when CompressionStream is available.
 */

import type { WallpaperParams } from '../core/params';
import { sanitizeParams } from '../core/params';

function toB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const b64 = s.replaceAll('-', '+').replaceAll('_', '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  void w.write(bytes as unknown as BufferSource).then(() => w.close());
  const buf = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buf);
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  void w.write(bytes as unknown as BufferSource).then(() => w.close());
  const buf = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(buf);
}

export async function encodeParams(p: WallpaperParams): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(p));
  if (typeof CompressionStream !== 'undefined') {
    return 'z' + toB64url(await deflate(json));
  }
  return 'b' + toB64url(json);
}

export async function decodeParams(encoded: string): Promise<WallpaperParams | null> {
  try {
    const mode = encoded[0];
    const bytes = fromB64url(encoded.slice(1));
    let json: Uint8Array;
    if (mode === 'z' && typeof DecompressionStream !== 'undefined') {
      json = await inflate(bytes);
    } else {
      json = bytes;
    }
    const text = new TextDecoder().decode(json);
    return sanitizeParams(JSON.parse(text));
  } catch {
    return null;
  }
}

export async function buildShareUrl(p: WallpaperParams): Promise<string> {
  const payload = await encodeParams(p);
  const url = new URL(location.href);
  url.hash = 'p=' + payload;
  return url.toString();
}

/** Returns params if the current URL carries a share payload (and cleans the URL). */
export async function consumeShareUrl(): Promise<WallpaperParams | null> {
  const hash = location.hash;
  if (!hash.startsWith('#p=')) return null;
  const params = await decodeParams(hash.slice(3));
  history.replaceState(null, '', location.pathname + location.search);
  return params;
}
