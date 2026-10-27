import { describe, it, expect } from 'vitest';
import { ZipWriter } from '../src/render/zip';

function u32at(bytes: Uint8Array, off: number): number {
  return (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
}

function u16at(bytes: Uint8Array, off: number): number {
  return bytes[off] | (bytes[off + 1] << 8);
}

describe('zip writer', () => {
  it('produces a structurally valid store-only zip', async () => {
    const zip = new ZipWriter();
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array(1000).fill(7);
    zip.add('frame_00000.png', a);
    zip.add('frame_00001.png', b);
    const blob = zip.finish();
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // local file header signature for the first entry
    expect(u32at(bytes, 0)).toBe(0x04034b50);
    // entry name follows the 30-byte local header
    const nameA = new TextDecoder().decode(bytes.subarray(30, 30 + 15));
    expect(nameA).toBe('frame_00000.png');

    // find EOCD from the end
    const eocdOff = bytes.length - 22;
    expect(u32at(bytes, eocdOff)).toBe(0x06054b50);
    expect(u16at(bytes, eocdOff + 8)).toBe(2); // entries on this disk
    expect(u16at(bytes, eocdOff + 10)).toBe(2); // total entries
    const cdSize = u32at(bytes, eocdOff + 12);
    const cdOffset = u32at(bytes, eocdOff + 16);
    expect(cdOffset + cdSize).toBe(eocdOff);

    // central directory starts with the central header signature
    expect(u32at(bytes, cdOffset)).toBe(0x02014b50);
    // second central header lies within the directory
    const recLen = 46 + 15; // header + name of the first entry
    expect(u32at(bytes, cdOffset + recLen)).toBe(0x02014b50);

    // second local header sits right after entry A's data
    const secondLocal = 30 + 15 + a.length;
    expect(u32at(bytes, secondLocal)).toBe(0x04034b50);
  });
});
