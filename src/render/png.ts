/**
 * Minimal streaming PNG encoder built on CompressionStream('deflate').
 * No canvas involved => no browser canvas size limits, works for 16K+.
 * Produces color type 6 (RGBA), 8 bit depth, no interlace, filter 0 rows.
 */

const SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(crc: number, data: Uint8Array): number {
  crc = ~crc >>> 0;
  for (let i = 0; i < data.length; i++) {
    crc = (CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return ~crc >>> 0;
}

function u32be(v: number): Uint8Array {
  return new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array(type.length);
  for (let i = 0; i < type.length; i++) typeBytes[i] = type.charCodeAt(i);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes);
  crcInput.set(data, typeBytes.length);
  const crc = crc32(0, crcInput);
  const out = new Uint8Array(12 + data.length);
  out.set(u32be(data.length), 0);
  out.set(typeBytes, 4);
  out.set(data, 8);
  out.set(u32be(crc), 8 + data.length);
  return out;
}

function ihdr(width: number, height: number): Uint8Array {
  const d = new Uint8Array(13);
  d.set(u32be(width), 0);
  d.set(u32be(height), 4);
  d[8] = 8; // bit depth
  d[9] = 6; // color type RGBA
  d[10] = 0; // compression
  d[11] = 0; // filter
  d[12] = 0; // interlace
  return d;
}

export class PngEncodeCanceled extends Error {
  constructor() {
    super('PNG encoding canceled');
  }
}

export interface PngWriter {
  /** Append one scanline: exactly width*4 RGBA bytes, rows strictly top-down. */
  row(rgba: Uint8Array): Promise<void>;
  finish(): Promise<Blob>;
  cancel(): void;
}

/**
 * Create a PNG encoder sink. Feed rows top-down, then finish().
 * Pixel rows stream through native deflate; chunk framing is added at finish().
 */
export function createPng(width: number, height: number): PngWriter {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('CompressionStream is not supported in this browser');
  }
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  const compressed: Uint8Array[] = [];
  let readError: unknown = null;

  // drain readable concurrently (backpressure-aware)
  const drained = (async () => {
    const reader = cs.readable.getReader();
    for (;;) {
      try {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) compressed.push(value);
      } catch (err) {
        readError = err;
        return;
      }
    }
  })();

  let canceled = false;

  return {
    async row(rgba: Uint8Array) {
      if (canceled) throw new PngEncodeCanceled();
      const line = new Uint8Array(rgba.length + 1);
      line[0] = 0; // filter type: None
      line.set(rgba, 1);
      await writer.write(line as unknown as BufferSource);
    },
    async finish(): Promise<Blob> {
      await writer.close();
      await drained;
      if (readError) throw readError;
      const idat = concat(compressed);
      const parts = [
        SIG.slice(),
        chunk('IHDR', ihdr(width, height)),
        chunk('IDAT', idat),
        chunk('IEND', new Uint8Array(0)),
      ] as unknown as BlobPart[];
      return new Blob(parts, { type: 'image/png' });
    },
    cancel() {
      canceled = true;
      void writer.abort().catch(() => {});
    },
  };
}

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
