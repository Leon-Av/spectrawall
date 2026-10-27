/**
 * Export dialog: two modes — still image (PNG/JPEG, up to 16K, tiled) and
 * animation video (MP4/WebM via WebCodecs, or a ZIP of PNG frames).
 */

import { h, toast, download } from './dom';
import { t } from './i18n';
import type { App } from './types';
import { MAX_DIM } from './types';
import { exportImage, ExportCanceled, renderThumbnailAspect } from '../render/tileRenderer';
import { exportVideo, detectVideoFormats, VideoExportCanceled } from '../render/videoExporter';
import type { VideoFormat } from '../render/videoExporter';
import type { Renderer } from '../render/context';
import type { HistoryStore } from '../core/history';

const VIDEO_PRESETS: { id: string; w: number; h: number }[] = [
  { id: 'fhd', w: 1920, h: 1080 },
  { id: 'qhd', w: 2560, h: 1440 },
  { id: '4k', w: 3840, h: 2160 },
  { id: 'phone', w: 1080, h: 2340 },
  { id: 'square', w: 1080, h: 1080 },
];

const IMAGE_PRESETS: { id: string; w: number; h: number }[] = [
  { id: 'fhd', w: 1920, h: 1080 },
  { id: 'qhd', w: 2560, h: 1440 },
  { id: '4k', w: 3840, h: 2160 },
  { id: '5k', w: 5120, h: 2880 },
  { id: '8k', w: 7680, h: 4320 },
  { id: '16k', w: 15360, h: 8640 },
  { id: 'uw34', w: 3440, h: 1440 },
  { id: 'uw51', w: 5120, h: 2160 },
  { id: 'phone', w: 1080, h: 2340 },
  { id: 'custom', w: 0, h: 0 },
];

export function openExportDialog(app: App, renderer: Renderer, history: HistoryStore | null): void {
  const overlay = h('div', { class: 'overlay' });
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  let canceled = false;
  let mode: 'image' | 'video' = 'image';

  // ---------- shared progress ----------
  const progressWrap = h('div', { class: 'progress-wrap', style: 'display:none' });
  const progressBar = h('div', { class: 'progress-bar' }) as HTMLDivElement;
  const progressLabel = h('div', { class: 'progress-label' });
  progressWrap.append(progressBar, progressLabel);
  const startBtn = h('button', { class: 'btn primary', type: 'button' }) as HTMLButtonElement;
  const cancelBtn = h('button', { class: 'btn ghost', type: 'button', style: 'display:none' }, t('btn.cancel')) as HTMLButtonElement;
  cancelBtn.addEventListener('click', () => (canceled = true));

  // ---------- image pane ----------
  const imgPane = h('div', { class: 'pane' });
  const imgSelect = h('select', { class: 'select' }) as HTMLSelectElement;
  for (const p of IMAGE_PRESETS) {
    const label = p.id === 'custom' ? t('bg.custom') : `${p.w} × ${p.h}`;
    imgSelect.append(h('option', { value: p.id, text: label }));
  }
  imgSelect.value = IMAGE_PRESETS.some((p) => p.id === app.resolution.preset)
    ? app.resolution.preset
    : 'custom';
  const imgW = h('input', { type: 'number', min: '16', max: String(MAX_DIM), class: 'num', value: String(app.resolution.w) }) as HTMLInputElement;
  const imgH = h('input', { type: 'number', min: '16', max: String(MAX_DIM), class: 'num', value: String(app.resolution.h) }) as HTMLInputElement;
  imgSelect.addEventListener('change', () => {
    const p = IMAGE_PRESETS.find((x) => x.id === imgSelect.value)!;
    if (p.id !== 'custom') {
      imgW.value = String(p.w);
      imgH.value = String(p.h);
    }
    syncImageWarning();
  });
  for (const inp of [imgW, imgH]) inp.addEventListener('change', () => (imgSelect.value = 'custom'));

  let imageFormat: 'png' | 'jpeg' = 'png';
  const fmtSeg = h('div', { class: 'segmented' });
  const pngBtn = h('button', { class: 'seg-btn active', type: 'button', onclick: () => setImgFormat('png') }, 'PNG');
  const jpgBtn = h('button', { class: 'seg-btn', type: 'button', onclick: () => setImgFormat('jpeg') }, 'JPEG');
  fmtSeg.append(pngBtn, jpgBtn);
  function setImgFormat(f: 'png' | 'jpeg') {
    imageFormat = f;
    pngBtn.classList.toggle('active', f === 'png');
    jpgBtn.classList.toggle('active', f === 'jpeg');
    qualityRow.style.display = f === 'jpeg' ? '' : 'none';
  }
  const qualityRow = h(
    'div',
    { class: 'slider-row', style: 'display:none' },
    h('div', { class: 'slider-head' }, h('label', {}, t('export.quality')), h('span', { class: 'slider-val' }, '95%')),
  );
  const qualityInput = h('input', { type: 'range', min: '60', max: '100', step: '1', value: '95' }) as HTMLInputElement;
  qualityRow.append(qualityInput);

  const imgWarning = h('p', { class: 'hint warn' }) as HTMLParagraphElement;
  function syncImageWarning() {
    const w = imgW.valueAsNumber || 0;
    const hh = imgH.valueAsNumber || 0;
    imgWarning.textContent = w * hh >= 7680 * 4320 ? '⚠ ' + t('export.ramWarning') : '';
  }
  imgW.addEventListener('change', syncImageWarning);
  imgH.addEventListener('change', syncImageWarning);
  syncImageWarning();

  imgPane.append(
    h('div', { class: 'row' }, h('label', {}, t('export.resolution')), imgSelect),
    h('div', { class: 'row' }, imgW, h('span', { class: 'x' }, '×'), imgH),
    h('div', { class: 'row' }, h('label', {}, t('export.format')), fmtSeg),
    qualityRow,
    imgWarning,
  );

  // ---------- video pane ----------
  const vidPane = h('div', { class: 'pane', style: 'display:none' });
  const vidSelect = h('select', { class: 'select' }) as HTMLSelectElement;
  for (const p of VIDEO_PRESETS) vidSelect.append(h('option', { value: p.id, text: `${p.w} × ${p.h}` }));
  const vidW = h('input', { type: 'number', min: '16', max: '4096', step: '2', class: 'num', value: '1920' }) as HTMLInputElement;
  const vidH = h('input', { type: 'number', min: '16', max: '4096', step: '2', class: 'num', value: '1080' }) as HTMLInputElement;
  vidSelect.addEventListener('change', () => {
    const p = VIDEO_PRESETS.find((x) => x.id === vidSelect.value)!;
    vidW.value = String(p.w);
    vidH.value = String(p.h);
  });
  for (const inp of [vidW, vidH]) inp.addEventListener('change', () => (vidSelect.value = 'custom'));

  const durSlider = h('input', { type: 'range', min: '4', max: '60', step: '1', value: String(app.params.animation.loopSeconds) }) as HTMLInputElement;
  const durVal = h('span', { class: 'slider-val' }, app.params.animation.loopSeconds + ' s') as HTMLSpanElement;
  durSlider.addEventListener('input', () => (durVal.textContent = durSlider.value + ' s'));
  const fpsSelect = h('select', { class: 'select' }) as HTMLSelectElement;
  for (const f of [24, 30, 60]) fpsSelect.append(h('option', { value: String(f), text: String(f) }));
  fpsSelect.value = '30';

  const formatSelect = h('select', { class: 'select' }) as HTMLSelectElement;
  const codecHint = h('p', { class: 'hint' }) as HTMLParagraphElement;
  void detectVideoFormats(1920, 1080).then((sup) => {
    if (sup.mp4) formatSelect.append(h('option', { value: 'mp4', text: 'MP4 (H.264)' }));
    if (sup.webm) formatSelect.append(h('option', { value: 'webm', text: 'WebM (VP9)' }));
    formatSelect.append(h('option', { value: 'frames', text: 'PNG frames (ZIP)' }));
    codecHint.textContent = sup.webCodecs ? '' : 'ℹ ' + t('export.noVideoCodecs');
  });

  const qualSelect = h('select', { class: 'select' }) as HTMLSelectElement;
  qualSelect.append(h('option', { value: '1', text: t('export.qualityStd') }), h('option', { value: '2', text: t('export.qualityHigh') }));

  vidPane.append(
    h('div', { class: 'row' }, h('label', {}, t('export.resolution')), vidSelect),
    h('div', { class: 'row' }, vidW, h('span', { class: 'x' }, '×'), vidH),
    h('div', { class: 'slider-row' },
      h('div', { class: 'slider-head' }, h('label', {}, t('export.duration')), durVal), durSlider),
    h('div', { class: 'row' }, h('label', {}, t('export.fps')), fpsSelect),
    h('div', { class: 'row' }, h('label', {}, t('export.videoFormat')), formatSelect),
    h('div', { class: 'row' }, h('label', {}, t('export.bitrate')), qualSelect),
    codecHint,
  );

  // ---------- mode tabs ----------
  const tabs = h('div', { class: 'segmented' });
  const tabImage = h('button', { class: 'seg-btn active', type: 'button' }, t('export.modeImage')) as HTMLButtonElement;
  const tabVideo = h('button', { class: 'seg-btn', type: 'button' }, t('export.modeVideo')) as HTMLButtonElement;
  tabs.append(tabImage, tabVideo);
  function setMode(m: 'image' | 'video') {
    mode = m;
    tabImage.classList.toggle('active', m === 'image');
    tabVideo.classList.toggle('active', m === 'video');
    imgPane.style.display = m === 'image' ? '' : 'none';
    vidPane.style.display = m === 'video' ? '' : 'none';
    startBtn.textContent = m === 'image' ? t('export.start') : t('export.startVideo');
  }
  tabImage.addEventListener('click', () => setMode('image'));
  tabVideo.addEventListener('click', () => setMode('video'));

  // ---------- actions ----------
  const busy = (on: boolean) => {
    startBtn.toggleAttribute('disabled', on);
    cancelBtn.style.display = on ? '' : 'none';
  };
  const setProgress = (done: number, total: number, stage: string) => {
    progressBar.style.width = Math.round((done / total) * 100) + '%';
    progressLabel.textContent = `${stage} ${done}/${total}`;
  };

  startBtn.addEventListener('click', () => {
    void (mode === 'image' ? runImage() : runVideo());
  });

  const runImage = async () => {
    const w = Math.min(MAX_DIM, Math.max(16, Math.round(imgW.valueAsNumber || 1920)));
    const hh = Math.min(MAX_DIM, Math.max(16, Math.round(imgH.valueAsNumber || 1080)));
    if (imageFormat === 'jpeg' && (w > 8192 || hh > 8192)) {
      imgWarning.textContent = '⚠ ' + t('export.jpegLimit');
      return;
    }
    canceled = false;
    busy(true);
    try {
      const { blob, ext } = await exportImage(renderer, app.params, {
        width: w,
        height: hh,
        format: imageFormat,
        jpegQuality: parseInt(qualityInput.value, 10) / 100,
        onProgress: (done, total) => setProgress(done, total, t('export.rendering')),
        shouldCancel: () => canceled,
      });
      const name = `spectrawall-${app.params.seed}-${w}x${hh}.${ext}`;
      download(blob, name);
      toast(t('export.done', { name }));
      await maybeAutosave(w / hh, history, app, renderer);
      close();
    } catch (err) {
      handleError(err);
    } finally {
      busy(false);
    }
  };

  const runVideo = async () => {
    const w = Math.min(4096, Math.max(16, Math.round(vidW.valueAsNumber / 2) * 2 || 1920));
    const hh = Math.min(4096, Math.max(16, Math.round(vidH.valueAsNumber / 2) * 2 || 1080));
    const format: VideoFormat = (formatSelect.value || 'frames') as VideoFormat;
    canceled = false;
    busy(true);
    try {
      const { blob, ext } = await exportVideo(renderer, app.params, {
        width: w,
        height: hh,
        fps: parseInt(fpsSelect.value, 10),
        seconds: parseInt(durSlider.value, 10),
        format,
        quality: parseInt(qualSelect.value, 10),
        onProgress: (done, total) => setProgress(done, total, t('export.encoding')),
        shouldCancel: () => canceled,
      });
      const name = `spectrawall-${app.params.seed}-${w}x${hh}.${ext}`;
      download(blob, name);
      toast(t('export.done', { name }));
      close();
    } catch (err) {
      handleError(err);
    } finally {
      busy(false);
    }
  };

  const handleError = (err: unknown) => {
    if (err instanceof ExportCanceled || err instanceof VideoExportCanceled) {
      toast(t('export.canceled'));
    } else {
      console.error(err);
      toast(String(err));
    }
  };

  const dialog = h(
    'div',
    { class: 'dialog' },
    h('div', { class: 'dialog-title' }, t('export.title')),
    tabs,
    imgPane,
    vidPane,
    progressWrap,
    h('div', { class: 'dialog-actions' }, cancelBtn, startBtn),
  );
  overlay.append(dialog);
  document.getElementById('overlay-root')!.append(overlay);
  setMode('image');
}

async function maybeAutosave(aspect: number, history: HistoryStore | null, app: App, renderer: Renderer): Promise<void> {
  if (!app.autosave || !history) return;
  const thumb = renderThumbnailAspect(renderer, app.params, aspect);
  await history.put({ id: crypto.randomUUID(), createdAt: Date.now(), params: app.params, thumb });
}
