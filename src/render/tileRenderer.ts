/**
 * High-resolution export: renders the scene in tiles (fits any GPU limits),
 * stitches rows into a streaming PNG or into a 2D canvas for JPEG.
 */

import type { Renderer } from './context';
import type { WallpaperParams } from '../core/params';
import { resolveStructure } from '../core/params';
import { createPng, PngEncodeCanceled } from './png';

export class ExportCanceled extends Error {
  constructor() {
    super('Export canceled');
  }
}

export interface ExportOptions {
  width: number;
  height: number;
  format: 'png' | 'jpeg';
  jpegQuality?: number;
  onProgress?: (done: number, total: number) => void;
  shouldCancel?: () => boolean;
}

export interface ExportResult {
  blob: Blob;
  ext: 'png' | 'jpg';
}

function checkCancel(opts: ExportOptions): void {
  if (opts.shouldCancel?.()) throw new ExportCanceled();
}

export async function exportImage(
  renderer: Renderer,
  params: WallpaperParams,
  opts: ExportOptions,
): Promise<ExportResult> {
  const resolved = resolveStructure(params);
  const full = { width: opts.width, height: opts.height, phase: 0, motion: 0 };
  if (opts.format === 'png') {
    const blob = await exportPng(renderer, params, resolved, full, opts);
    return { blob, ext: 'png' };
  }
  const blob = await exportJpeg(renderer, params, resolved, full, opts);
  return { blob, ext: 'jpg' };
}

async function exportPng(
  renderer: Renderer,
  params: WallpaperParams,
  resolved: ReturnType<typeof resolveStructure>,
  full: { width: number; height: number },
  opts: ExportOptions,
): Promise<Blob> {
  const { width: W, height: H } = full;
  const png = createPng(W, H);
  const tile = Math.min(4096, renderer.maxTextureSize);
  const tilesX = Math.ceil(W / tile);
  const tilesY = Math.ceil(H / tile);
  const totalTiles = tilesX * tilesY;
  let done = 0;
  const fullRow = new Uint8Array(W * 4);

  try {
    // render horizontal bands of tiles; PNG rows span the full image width
    for (let ty = 0; ty < tilesY; ty++) {
      const y0 = ty * tile; // from top
      const th = Math.min(tile, H - y0);
      const yGl = H - y0 - th; // GL bottom-left origin
      const bands: Uint8Array[] = [];
      for (let tx = 0; tx < tilesX; tx++) {
        checkCancel(opts);
        const x0 = tx * tile;
        const tw = Math.min(tile, W - x0);
        renderer.renderTile(params, resolved, { ...full, phase: 0, motion: 0 }, x0, yGl, tw, th);
        bands.push(renderer.readTile());
        done++;
        opts.onProgress?.(done, totalTiles);
      }
      // GL returns rows bottom-up; PNG needs top-down => iterate reversed
      for (let lr = th - 1; lr >= 0; lr--) {
        for (let tx = 0; tx < tilesX; tx++) {
          const x0 = tx * tile;
          const tw = Math.min(tile, W - x0);
          const src = bands[tx].subarray(lr * tw * 4, (lr + 1) * tw * 4);
          fullRow.set(src, x0 * 4);
        }
        await png.row(fullRow);
      }
      // yield to the event loop so UI/progress repaints
      await new Promise((r) => setTimeout(r, 0));
    }
    checkCancel(opts);
    opts.onProgress?.(totalTiles, totalTiles);
    return await png.finish();
  } catch (err) {
    png.cancel();
    if (err instanceof PngEncodeCanceled || err instanceof ExportCanceled) {
      throw new ExportCanceled();
    }
    throw err;
  }
}

async function exportJpeg(
  renderer: Renderer,
  params: WallpaperParams,
  resolved: ReturnType<typeof resolveStructure>,
  full: { width: number; height: number },
  opts: ExportOptions,
): Promise<Blob> {
  const { width: W, height: H } = full;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const tile = Math.min(4096, renderer.maxTextureSize);
  const tilesX = Math.ceil(W / tile);
  const tilesY = Math.ceil(H / tile);
  const totalTiles = tilesX * tilesY;
  let done = 0;

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      checkCancel(opts);
      const x0 = tx * tile;
      const y0 = ty * tile;
      const tw = Math.min(tile, W - x0);
      const th = Math.min(tile, H - y0);
      const yGl = H - y0 - th;
      renderer.renderTile(params, resolved, { ...full, phase: 0, motion: 0 }, x0, yGl, tw, th);
      const px = renderer.readTile();
      // flip rows into an ImageData
      const img = ctx.createImageData(tw, th);
      for (let row = 0; row < th; row++) {
        const src = (th - 1 - row) * tw * 4;
        img.data.set(px.subarray(src, src + tw * 4), row * tw * 4);
      }
      ctx.putImageData(img, x0, y0);
      done++;
      opts.onProgress?.(done, totalTiles);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  opts.onProgress?.(totalTiles, totalTiles);
  return await toBlob(canvas, 'image/jpeg', opts.jpegQuality ?? 0.95);
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas encoding failed'))),
      type,
      quality,
    );
  });
}

/** Small JPEG data-URL for history thumbnails. */
export function renderThumbnailAspect(
  renderer: Renderer,
  params: WallpaperParams,
  aspect: number,
  maxW = 440,
): string {
  const w = Math.min(maxW, 1024);
  const h = Math.max(1, Math.round(w / aspect));
  const resolved = resolveStructure(params);
  renderer.renderTile(params, resolved, { width: w, height: h, phase: 0, motion: 0 }, 0, 0, w, h);
  const px = renderer.readTile();
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let row = 0; row < h; row++) {
    const src = (h - 1 - row) * w * 4;
    img.data.set(px.subarray(src, src + w * 4), row * w * 4);
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}
