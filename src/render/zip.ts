/**
 * Minimal store-only ZIP writer (no compression — entries are already-compressed
 * PNG frames). Entries accumulate as Blob parts, so the browser can page them
 * to disk; a 900-frame archive never has to exist fully in RAM.
 */

import { crc32 } from './png';

function u16(v: number, out: Uint8Array, off: number): void {
  out[off] = v & 0xff;
  out[off + 1] = (v >>> 8) & 0xff;
}

function u32(v: number, out: Uint8Array, off: number): void {
  out[off] = v & 0xff;
  out[off + 1] = (v >>> 8) & 0xff;
  out[off + 2] = (v >>> 16) & 0xff;
  out[off + 3] = (v >>> 24) & 0xff;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

interface CentralEntry {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
}

export class ZipWriter {
  private parts: BlobPart[] = [];
  private offset = 0;
  private central: CentralEntry[] = [];
  private readonly when = dosDateTime(new Date());

  add(name: string, data: Uint8Array): void {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(0, data);
    const local = new Uint8Array(30 + nameBytes.length);
    u32(0x04034b50, local, 0);
    u16(20, local, 4); // version needed
    u16(0, local, 6); // flags
    u16(0, local, 8); // method: store
    u16(this.when.time, local, 10);
    u16(this.when.date, local, 12);
    u32(crc, local, 14);
    u32(data.length, local, 18);
    u32(data.length, local, 22);
    u16(nameBytes.length, local, 26);
    u16(0, local, 28);
    local.set(nameBytes, 30);

    this.parts.push(local as unknown as BlobPart, data as unknown as BlobPart);
    this.central.push({ name: nameBytes, crc, size: data.length, offset: this.offset });
    this.offset += local.length + data.length;
  }

  finish(): Blob {
    const centralParts: BlobPart[] = [];
    let centralSize = 0;
    for (const e of this.central) {
      const rec = new Uint8Array(46 + e.name.length);
      u32(0x02014b50, rec, 0);
      u16(20, rec, 4); // version made by
      u16(20, rec, 6); // version needed
      u16(0, rec, 8);
      u16(0, rec, 10);
      u16(this.when.time, rec, 12);
      u16(this.when.date, rec, 14);
      u32(e.crc, rec, 16);
      u32(e.size, rec, 20);
      u32(e.size, rec, 24);
      u16(e.name.length, rec, 28);
      u16(0, rec, 30); // extra len
      u16(0, rec, 32); // comment len
      u16(0, rec, 34); // disk number
      u16(0, rec, 36); // internal attrs
      u32(0, rec, 38); // external attrs
      u32(e.offset, rec, 42);
      rec.set(e.name, 46);
      centralParts.push(rec as unknown as BlobPart);
      centralSize += rec.length;
    }
    const eocd = new Uint8Array(22);
    u32(0x06054b50, eocd, 0);
    u16(0, eocd, 4);
    u16(0, eocd, 6);
    u16(this.central.length, eocd, 8);
    u16(this.central.length, eocd, 10);
    u32(centralSize, eocd, 12);
    u32(this.offset, eocd, 16);
    u16(0, eocd, 20);
    return new Blob([...this.parts, ...centralParts, eocd] as unknown as BlobPart[], {
      type: 'application/zip',
    });
  }
}
