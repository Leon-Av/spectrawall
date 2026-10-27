import { describe, it, expect } from 'vitest';
import { createPng } from '../src/render/png';

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function inflateZlib(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const w = ds.writable.getWriter();
  void w.write(data as unknown as BufferSource).then(() => w.close());
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

function findChunk(bytes: Uint8Array, type: string): { data: Uint8Array; length: number } | null {
  const decoder = new TextDecoder();
  let off = 8; // skip signature
  while (off + 8 <= bytes.length) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset + off, 8);
    const len = dv.getUint32(0);
    const chunkType = decoder.decode(bytes.subarray(off + 4, off + 8));
    if (chunkType === type) {
      return { data: bytes.subarray(off + 8, off + 8 + len), length: len };
    }
    off += 12 + len;
  }
  return null;
}

// needs node:buffer for Blob parts in this environment
async function collect(png: ReturnType<typeof createPng>, rows: number, w: number): Promise<Uint8Array> {
  for (let y = 0; y < rows; y++) {
    const row = new Uint8Array(w * 4);
    for (let x = 0; x < w; x++) {
      row[x * 4] = (x * 8) % 256;
      row[x * 4 + 1] = (y * 8) % 256;
      row[x * 4 + 2] = 128;
      row[x * 4 + 3] = 255;
    }
    await png.row(row);
  }
  const blob = await png.finish();
  return new Uint8Array(await blob.arrayBuffer());
}

describe.skipIf(typeof CompressionStream === 'undefined')('png encoder', () => {
  it('produces a valid PNG with correct IHDR and decodable pixels', async () => {
    const w = 7;
    const hh = 5;
    const png = createPng(w, hh);
    const bytes = await collect(png, hh, w);

    expect(Array.from(bytes.slice(0, 8))).toEqual(SIG);
    const ihdr = findChunk(bytes, 'IHDR');
    expect(ihdr).not.toBeNull();
    const dv = new DataView(ihdr!.data.buffer, ihdr!.data.byteOffset);
    expect(dv.getUint32(0)).toBe(w);
    expect(dv.getUint32(4)).toBe(hh);
    expect(ihdr!.data[8]).toBe(8); // bit depth
    expect(ihdr!.data[9]).toBe(6); // RGBA
    expect(findChunk(bytes, 'IDAT')).not.toBeNull();
    expect(findChunk(bytes, 'IEND')).not.toBeNull();

    // decompressed IDAT must contain rows with filter byte 0
    const idat = findChunk(bytes, 'IDAT')!;
    const raw = await inflateZlib(idat.data);
    expect(raw.length).toBe(hh * (1 + w * 4));
    for (let y = 0; y < hh; y++) {
      const rowStart = y * (1 + w * 4);
      expect(raw[rowStart]).toBe(0); // filter none
      // spot-check a pixel
      expect(raw[rowStart + 1]).toBe((0 * 8) % 256);
      expect(raw[rowStart + 2]).toBe((y * 8) % 256);
      expect(raw[rowStart + 3]).toBe(128);
      expect(raw[rowStart + 4]).toBe(255);
    }
  });

  it('1x1 image works', async () => {
    const png = createPng(1, 1);
    const bytes = await collect(png, 1, 1);
    const ihdr = findChunk(bytes, 'IHDR')!;
    const dv = new DataView(ihdr.data.buffer, ihdr.data.byteOffset);
    expect(dv.getUint32(0)).toBe(1);
    expect(dv.getUint32(4)).toBe(1);
  });
});
