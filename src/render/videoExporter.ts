/**
 * Animation export (iteration 2): the noise field moves on a closed circle in
 * noise-time, so rendering N frames with phase = 2*pi*i/N yields a perfectly
 * seamless loop. Encoded via WebCodecs (MP4/H.264 or WebM/VP9) or exported as
 * a ZIP of PNG frames for external encoders.
 */

import type { Renderer } from './context';
import type { WallpaperParams } from '../core/params';
import { resolveStructure } from '../core/params';
import { createPng } from './png';
import { ZipWriter } from './zip';
import { yieldUI, delayMs } from './yield';

export class VideoExportCanceled extends Error {
  constructor() {
    super('Video export canceled');
  }
}

export type VideoFormat = 'mp4' | 'webm' | 'frames';

export interface VideoOptions {
  width: number; // even, <= 4096
  height: number;
  fps: number;
  seconds: number;
  format: VideoFormat;
  quality?: number; // bitrate multiplier, 1 = standard
  onProgress?: (done: number, total: number) => void;
  shouldCancel?: () => boolean;
}

export interface VideoResult {
  blob: Blob;
  ext: string;
}

const H264_LADDER = ['avc1.640033', 'avc1.64002A', 'avc1.640028', 'avc1.4D0028'];

/** Which video formats this browser can produce at the given size. */
export async function detectVideoFormats(
  width: number,
  height: number,
): Promise<{ mp4: boolean; webm: boolean; webCodecs: boolean }> {
  if (typeof VideoEncoder === 'undefined') return { mp4: false, webm: false, webCodecs: false };
  const probe = (codec: string) =>
    VideoEncoder.isConfigSupported({
      codec,
      width,
      height,
      bitrate: 8_000_000,
      framerate: 30,
    }).then((r) => !!r.supported).catch(() => false);
  const [h264, vp9] = await Promise.all([
    (async () => {
      for (const codec of H264_LADDER) {
        if (await probe(codec)) return true;
      }
      return false;
    })(),
    probe('vp09.00.10.08'),
  ]);
  return { mp4: h264, webm: vp9, webCodecs: true };
}

export async function exportVideo(
  renderer: Renderer,
  params: WallpaperParams,
  opts: VideoOptions,
): Promise<VideoResult> {
  if (opts.format === 'frames') {
    const blob = await exportPngFrames(renderer, params, opts);
    return { blob, ext: 'zip' };
  }
  const blob = await exportEncoded(renderer, params, opts);
  return { blob, ext: opts.format };
}

function totalFramesOf(opts: VideoOptions): number {
  return Math.max(2, Math.round(opts.fps * opts.seconds));
}

function checkCancel(opts: VideoOptions): void {
  if (opts.shouldCancel?.()) throw new VideoExportCanceled();
}

async function exportEncoded(
  renderer: Renderer,
  params: WallpaperParams,
  opts: VideoOptions,
): Promise<Blob> {
  const { width, height, fps } = opts;
  const total = totalFramesOf(opts);
  const resolved = resolveStructure(params);
  const motion = params.animation.motion;
  const bitrate = Math.round(width * height * fps * 0.12 * (opts.quality ?? 1));

  let codec: string | null = null;
  if (opts.format === 'mp4') {
    for (const candidate of H264_LADDER) {
      if (await VideoEncoder.isConfigSupported({ codec: candidate, width, height, bitrate, framerate: fps }).then(r => !!r.supported).catch(() => false)) {
        codec = candidate;
        break;
      }
    }
    if (!codec) throw new Error('H.264 encoding is not supported at this size');
  }

  let encodeError: Error | null = null;
  // dynamic imports keep the muxers out of the initial bundle path
  if (opts.format === 'mp4') {
    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width, height, frameRate: fps },
      fastStart: 'in-memory',
    });
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        encodeError = e;
      },
    });
    encoder.configure({ codec: codec!, width, height, bitrate, framerate: fps, latencyMode: 'quality', avc: { format: 'avc' } });
    await renderFrames(renderer, params, resolved, motion, opts, total, encoder);
    await encoder.flush();
    encoder.close();
    muxer.finalize();
    const { buffer } = target as unknown as { buffer: ArrayBuffer };
    return new Blob([buffer], { type: 'video/mp4' });
  }

  const { Muxer, ArrayBufferTarget } = await import('webm-muxer');
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'V_VP9', width, height, frameRate: fps },
  });
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e;
    },
  });
  encoder.configure({ codec: 'vp09.00.10.08', width, height, bitrate, framerate: fps, latencyMode: 'quality' });
  await renderFrames(renderer, params, resolved, motion, opts, total, encoder);
  await encoder.flush();
  encoder.close();
  muxer.finalize();
  const { buffer } = target as unknown as { buffer: ArrayBuffer };
  if (encodeError) throw encodeError;
  return new Blob([buffer], { type: 'video/webm' });
}

/** Shared render+encode loop for MP4/WebM. */
async function renderFrames(
  renderer: Renderer,
  params: WallpaperParams,
  resolved: ReturnType<typeof resolveStructure>,
  motion: number,
  opts: VideoOptions,
  total: number,
  encoder: VideoEncoder,
): Promise<void> {
  const { width, height, fps } = opts;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < total; i++) {
    checkCancel(opts);
    const phase = (i / total) * Math.PI * 2;
    renderer.renderTile(params, resolved, { width, height, phase, motion }, 0, 0, width, height);
    renderer.readTileInto(rgba);
    const frame = new VideoFrame(rgba as unknown as BufferSource, {
      format: 'RGBA',
      timestamp: Math.round((i * 1_000_000) / fps),
      codedWidth: width,
      codedHeight: height,
    });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    // backpressure: don't outrun the hardware encoder by too much
    while (encoder.encodeQueueSize > 4) {
      await delayMs(8);
    }
    opts.onProgress?.(i + 1, total);
    await yieldUI();
  }
}

async function exportPngFrames(
  renderer: Renderer,
  params: WallpaperParams,
  opts: VideoOptions,
): Promise<Blob> {
  const { width, height } = opts;
  const total = totalFramesOf(opts);
  const resolved = resolveStructure(params);
  const motion = params.animation.motion;
  const zip = new ZipWriter();
  for (let i = 0; i < total; i++) {
    checkCancel(opts);
    const phase = (i / total) * Math.PI * 2;
    renderer.renderTile(params, resolved, { width, height, phase, motion }, 0, 0, width, height);
    const px = renderer.readTile();
    const png = createPng(width, height);
    for (let row = height - 1; row >= 0; row--) {
      await png.row(px.subarray(row * width * 4, (row + 1) * width * 4));
    }
    const blob = await png.finish();
    zip.add(`frame_${String(i).padStart(5, '0')}.png`, new Uint8Array(await blob.arrayBuffer()));
    opts.onProgress?.(i + 1, total);
    await yieldUI();
  }
  checkCancel(opts);
  return zip.finish();
}
