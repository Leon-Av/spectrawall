/**
 * App bootstrap: state, preview render loop, header wiring.
 */

import { Renderer } from './render/context';
import { renderThumbnailAspect } from './render/tileRenderer';
import {
  defaultParams,
  sanitizeParams,
  cloneParams,
  rerollSeed,
  rerollPalette,
  resolveStructure,
  isLightBackground,
} from './core/params';
import type { ResolvedStructure } from './core/params';
import { HistoryStore } from './core/history';
import { initLang, setLang, getLang, t } from './ui/i18n';
import type { App, ResolutionChoice } from './ui/types';
import { buildSidebar } from './ui/controls';
import type { SidebarHandles } from './ui/controls';
import { openExportDialog } from './ui/exportDialog';
import { openHistoryDialog } from './ui/gallery';
import { buildShareUrl, consumeShareUrl } from './ui/share';
import { h, clear, toast, copyText } from './ui/dom';

// ---------- state ----------

let params = defaultParams();
let resolution: ResolutionChoice = { preset: '4k', w: 3840, h: 2160 };
let autosave = localStorage.getItem('sw.autosave') === '1';
let renderer: Renderer | null = null;
let history: HistoryStore | null = null;
let sidebar: SidebarHandles | null = null;
let app: App | null = null;
let dirty = true;
let resolved: ResolvedStructure | null = null;
let playing = false;
let phase = 0;
let lastTs = 0;

// ---------- boot ----------

async function boot(): Promise<void> {
  initLang();

  const shared = await consumeShareUrl();
  if (shared) {
    params = shared;
  } else {
    const saved = localStorage.getItem('sw.params');
    if (saved) {
      try {
        params = sanitizeParams(JSON.parse(saved));
      } catch {
        params = defaultParams();
      }
    }
  }
  const savedRes = localStorage.getItem('sw.res');
  if (savedRes) {
    try {
      const r = JSON.parse(savedRes) as ResolutionChoice;
      if (r && typeof r.w === 'number' && typeof r.h === 'number' && r.w >= 16 && r.h >= 16) {
        resolution = r;
      }
    } catch {
      /* keep default */
    }
  }

  const canvas = document.getElementById('preview') as HTMLCanvasElement;
  try {
    renderer = new Renderer(canvas);
  } catch (err) {
    console.error(err);
    const stage = document.getElementById('stage')!;
    clear(stage);
    stage.append(h('div', { class: 'webgl-error' }, t('error.webgl')));
    buildHeader();
    return;
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    toast('WebGL context lost — reload the page');
  });

  try {
    history = await HistoryStore.open();
  } catch (err) {
    console.warn('IndexedDB unavailable', err);
  }

  app = {
    get params() {
      return params;
    },
    set params(p) {
      params = p;
    },
    get resolution() {
      return resolution;
    },
    set resolution(r) {
      resolution = r;
      localStorage.setItem('sw.res', JSON.stringify(r));
      sizeCanvas();
    },
    get autosave() {
      return autosave;
    },
    set autosave(v) {
      autosave = v;
      localStorage.setItem('sw.autosave', v ? '1' : '0');
    },
    get playing() {
      return playing;
    },
    set playing(v) {
      playing = v;
      dirty = true;
    },
    refresh,
    rebuildUI,
    updateSeedInput,
    saveToHistory,
    openExport: () => {
      if (renderer) openExportDialog(app!, renderer, history);
    },
    openHistory: () => {
      if (history) openHistoryDialog(app!, history);
    },
  };

  buildHeader();
  sidebar = buildSidebar(document.getElementById('sidebar')!, app);
  updateSeedInput();
  sizeCanvas();
  new ResizeObserver(sizeCanvas).observe(document.getElementById('stage')!);
  requestAnimationFrame(loop);
}

// ---------- preview loop ----------

function loop(ts: number): void {
  const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.25) : 0;
  lastTs = ts;
  if (playing) {
    // phase advances around the full circle once per loop => seamless
    phase = (phase + (dt / params.animation.loopSeconds) * Math.PI * 2) % (Math.PI * 2);
    dirty = true;
  }
  if (dirty && renderer) {
    dirty = false;
    resolved = resolveStructure(params);
    // paused preview renders the exact still image (phase 0, no motion)
    renderer.renderPreview(
      params,
      resolved,
      playing ? phase : 0,
      playing ? params.animation.motion : 0,
    );
  }
  requestAnimationFrame(loop);
}

function sizeCanvas(): void {
  const canvas = document.getElementById('preview') as HTMLCanvasElement | null;
  const stage = document.getElementById('stage');
  if (!canvas || !stage) return;
  const box = stage.getBoundingClientRect();
  const aspect = resolution.w / resolution.h;
  let w = box.width - 32;
  let hh = w / aspect;
  if (hh > box.height - 32) {
    hh = box.height - 32;
    w = hh * aspect;
  }
  w = Math.max(64, Math.floor(w));
  hh = Math.max(64, Math.floor(hh));
  canvas.style.width = w + 'px';
  canvas.style.height = hh + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pw = Math.round(w * dpr);
  const ph = Math.round(hh * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
    dirty = true;
  }
}

function refresh(): void {
  dirty = true;
  sidebar?.update();
  localStorage.setItem('sw.params', JSON.stringify(params));
}

function updateSeedInput(): void {
  const input = document.getElementById('seed-input') as HTMLInputElement | null;
  if (input) input.value = params.seed;
}

function applySeed(text: string): void {
  const v = text.trim();
  if (!v || v === params.seed) {
    updateSeedInput();
    return;
  }
  params.seed = v;
  const keys = ['layers', 'scale', 'warp', 'streaks', 'intensity'] as const;
  for (const k of keys) params.structure[k] = null;
  rerollPalette(params, isLightBackground(params) ? 'light' : 'dark');
  refresh();
}

// ---------- header ----------

function headerButton(text: string, id: string, onClick: () => void): HTMLButtonElement {
  return h('button', { class: 'btn ghost', id, type: 'button', onclick: onClick }, text);
}

async function doShare(): Promise<void> {
  if (!app) return;
  const url = await buildShareUrl(app.params);
  if (await copyText(url)) {
    toast(t('toast.linkCopied'));
  } else {
    window.prompt(t('toast.linkCopied'), url);
  }
}

async function saveToHistory(): Promise<void> {
  if (!history || !renderer || !app) return;
  const aspect = app.resolution.w / app.resolution.h;
  const thumb = renderThumbnailAspect(renderer, app.params, aspect);
  await history.put({
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    params: cloneParams(app.params),
    thumb,
  });
  toast(t('toast.saved'));
}

function randomizeAll(): void {
  if (!app) return;
  rerollSeed(app.params);
  const styles = ['silk', 'mesh', 'aurora', 'dunes', 'nebula', 'rays'] as const;
  app.params.style = styles[Math.floor(Math.random() * styles.length)];
  app.params.colorShare = 0.3 + Math.random() * 0.45;
  app.params.blur = 0.15 + Math.random() * 0.5;
  app.params.vignette = Math.random() * 0.4;
  refresh();
  updateSeedInput();
}

function buildHeader(): void {
  const header = document.getElementById('topbar');
  if (!header) return;
  clear(header);

  const brand = h(
    'div',
    { class: 'brand' },
    h('span', { class: 'brand-mark' }),
    h('span', { class: 'brand-name' }, 'SpectraWall'),
  );

  const seedInput = h('input', {
    class: 'seed-input',
    id: 'seed-input',
    type: 'text',
    spellcheck: 'false',
  }) as HTMLInputElement;
  seedInput.addEventListener('change', () => applySeed(seedInput.value));
  const seedBox = h(
    'div',
    { class: 'seed-box' },
    seedInput,
    h('button', {
      class: 'icon-btn',
      id: 'btn-seed',
      type: 'button',
      title: t('btn.newSeed'),
      onclick: () => {
        if (!app) return;
        rerollSeed(app.params);
        refresh();
        updateSeedInput();
      },
    }, '🎲'),
  );

  const randomAllBtn = headerButton(t('btn.randomAll'), 'btn-random', randomizeAll);
  const saveBtn = headerButton(t('btn.save'), 'btn-save', () => void saveToHistory());
  const shareBtn = headerButton(t('btn.share'), 'btn-share', () => void doShare());
  const historyBtn = headerButton(t('btn.history'), 'btn-history', () => app?.openHistory());
  const exportBtn = headerButton(t('btn.export'), 'btn-export', () => app?.openExport());
  exportBtn.classList.add('primary');

  const langSelect = h('select', { class: 'select lang', id: 'lang-select' }) as HTMLSelectElement;
  langSelect.append(h('option', { value: 'en', text: 'EN' }), h('option', { value: 'ru', text: 'RU' }));
  langSelect.value = getLang();
  langSelect.addEventListener('change', () => {
    setLang(langSelect.value as 'en' | 'ru');
    rebuildUI();
  });

  header.append(
    brand,
    seedBox,
    randomAllBtn,
    h('span', { class: 'spacer' }),
    saveBtn,
    shareBtn,
    historyBtn,
    exportBtn,
    langSelect,
  );
  updateSeedInput();
}

// ---------- rebuild (language switch) ----------

function rebuildUI(): void {
  buildHeader();
  if (app) {
    sidebar = buildSidebar(document.getElementById('sidebar')!, app);
    sidebar.update();
  }
  dirty = true;
}

void boot();
