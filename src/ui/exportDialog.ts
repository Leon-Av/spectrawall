/**
 * Export dialog: resolution, format, progress, cancel.
 */

import { h, toast, download } from './dom';
import { t } from './i18n';
import type { App } from './types';
import { RES_PRESETS, MAX_DIM } from './types';
import { exportImage, ExportCanceled, renderThumbnailAspect } from '../render/tileRenderer';
import type { Renderer } from '../render/context';
import type { HistoryStore } from '../core/history';

export function openExportDialog(app: App, renderer: Renderer, history: HistoryStore | null): void {
  const overlay = h('div', { class: 'overlay' });
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  let canceled = false;

  // --- resolution ---
  const select = h('select', { class: 'select' }) as HTMLSelectElement;
  for (const p of RES_PRESETS) {
    const label = p.id === 'custom' ? t('bg.custom') : `${p.w} × ${p.h}`;
    select.append(h('option', { value: p.id, text: label }));
  }
  select.value = app.resolution.preset;
  const wInput = h('input', { type: 'number', min: '16', max: String(MAX_DIM), class: 'num', value: String(app.resolution.w) }) as HTMLInputElement;
  const hInput = h('input', { type: 'number', min: '16', max: String(MAX_DIM), class: 'num', value: String(app.resolution.h) }) as HTMLInputElement;
  select.addEventListener('change', () => {
    const p = RES_PRESETS.find((x) => x.id === select.value)!;
    if (p.id !== 'custom') {
      wInput.value = String(p.w);
      hInput.value = String(p.h);
    }
    syncWarning();
  });
  for (const inp of [wInput, hInput]) inp.addEventListener('change', () => (select.value = 'custom'));

  // --- format ---
  let format: 'png' | 'jpeg' = 'png';
  const fmtSeg = h('div', { class: 'segmented' });
  const pngBtn = h('button', { class: 'seg-btn active', type: 'button', onclick: () => setFormat('png') }, 'PNG');
  const jpgBtn = h('button', { class: 'seg-btn', type: 'button', onclick: () => setFormat('jpeg') }, 'JPEG');
  fmtSeg.append(pngBtn, jpgBtn);
  function setFormat(f: 'png' | 'jpeg') {
    format = f;
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

  const warning = h('p', { class: 'hint warn' }) as HTMLParagraphElement;
  function syncWarning() {
    const w = wInput.valueAsNumber || 0;
    const hh = hInput.valueAsNumber || 0;
    const big = w * hh >= 7680 * 4320;
    warning.textContent = big ? '⚠ ' + t('export.ramWarning') : '';
  }
  wInput.addEventListener('change', syncWarning);
  hInput.addEventListener('change', syncWarning);
  syncWarning();

  // --- progress ---
  const progressWrap = h('div', { class: 'progress-wrap', style: 'display:none' });
  const progressBar = h('div', { class: 'progress-bar' }) as HTMLDivElement;
  const progressLabel = h('div', { class: 'progress-label' }, t('export.rendering'));
  progressWrap.append(progressBar, progressLabel);

  const startBtn = h(
    'button',
    {
      class: 'btn primary',
      type: 'button',
      onclick: () => void run(),
    },
    t('export.start'),
  );
  const cancelBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => (canceled = true), style: 'display:none' }, t('btn.cancel'));

  const run = async () => {
    const w = Math.min(MAX_DIM, Math.max(16, Math.round(wInput.valueAsNumber || 1920)));
    const hh = Math.min(MAX_DIM, Math.max(16, Math.round(hInput.valueAsNumber || 1080)));
    if (format === 'jpeg' && (w > 8192 || hh > 8192)) {
      warning.textContent = '⚠ ' + t('export.jpegLimit');
      return;
    }
    canceled = false;
    startBtn.setAttribute('disabled', 'true');
    select.setAttribute('disabled', 'true');
    cancelBtn.style.display = '';
    progressWrap.style.display = '';
    progressBar.style.width = '0%';
    try {
      const { blob, ext } = await exportImage(renderer, app.params, {
        width: w,
        height: hh,
        format,
        jpegQuality: parseInt(qualityInput.value, 10) / 100,
        onProgress: (done, total) => {
          progressBar.style.width = Math.round((done / total) * 100) + '%';
          progressLabel.textContent = `${t('export.rendering')} ${done}/${total}`;
        },
        shouldCancel: () => canceled,
      });
      const name = `spectrawall-${app.params.seed}-${w}x${hh}.${ext}`;
      download(blob, name);
      toast(t('export.done', { name }));
      if (app.autosave && history) {
        const thumb = renderThumbnailAspect(renderer, app.params, w / hh);
        await history.put({
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          params: app.params,
          thumb,
        });
      }
      close();
    } catch (err) {
      if (err instanceof ExportCanceled) {
        toast(t('export.canceled'));
      } else {
        console.error(err);
        toast(String(err));
      }
    } finally {
      startBtn.removeAttribute('disabled');
      select.removeAttribute('disabled');
      cancelBtn.style.display = 'none';
    }
  };

  const dialog = h(
    'div',
    { class: 'dialog' },
    h('div', { class: 'dialog-title' }, t('export.title')),
    h('div', { class: 'row' }, h('label', {}, t('export.resolution')), select),
    h('div', { class: 'row' }, wInput, h('span', { class: 'x' }, '×'), hInput),
    h('div', { class: 'row' }, h('label', {}, t('export.format')), fmtSeg),
    qualityRow,
    warning,
    progressWrap,
    h('div', { class: 'dialog-actions' }, cancelBtn, startBtn),
  );
  overlay.append(dialog);
  document.getElementById('overlay-root')!.append(overlay);
}
