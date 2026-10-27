/**
 * Sidebar: presets, style, palette, background, effects, advanced, canvas size.
 */

import { h, clear } from './dom';
import { t } from './i18n';
import type { App, ResolutionChoice } from './types';
import { RES_PRESETS, MAX_DIM } from './types';
import {
  MAX_COLORS,
  MIN_COLORS,
  cloneParams,
  isLightBackground,
  rerollPalette,
  resolveStructure,
} from '../core/params';
import { BUILTIN_PRESETS } from '../core/builtinPresets';

export interface SidebarHandles {
  update(): void; // sync all inputs with current params
}

export function buildSidebar(root: HTMLElement, app: App): SidebarHandles {
  clear(root);
  const updaters: (() => void)[] = [];
  const update = () => updaters.forEach((f) => f());

  root.append(
    presetSection(app, updaters),
    styleSection(app, updaters),
    paletteSection(app, updaters),
    backgroundSection(app, updaters),
    effectsSection(app, updaters),
    advancedSection(app, updaters),
    canvasSection(app, updaters),
  );
  update();
  return { update };
}

// ---------- building blocks ----------

function section(titleKey: string, ...body: HTMLElement[]): HTMLDetailsElement {
  const el = h('details', { class: 'section', open: true });
  el.append(h('summary', {}, t(titleKey)));
  const inner = h('div', { class: 'section-body' });
  inner.append(...body);
  el.append(inner);
  return el;
}

function sliderRow(
  label: string,
  min: number,
  max: number,
  step: number,
  get: () => number,
  set: (v: number) => void,
  format?: (v: number) => string,
): { el: HTMLDivElement; sync: () => void } {
  const value = h('span', { class: 'slider-val' });
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step) }) as HTMLInputElement;
  const fmt = format ?? ((v: number) => String(Math.round(v * 100) / 100));
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    set(v);
    value.textContent = fmt(v);
  });
  const sync = () => {
    input.value = String(get());
    value.textContent = fmt(get());
  };
  sync();
  const el = h(
    'div',
    { class: 'slider-row' },
    h('div', { class: 'slider-head' }, h('label', {}, label), value),
    input,
  );
  return { el, sync };
}

// ---------- sections ----------

function presetSection(app: App, updaters: (() => void)[]): HTMLElement {
  const select = h('select', { class: 'select' }) as HTMLSelectElement;
  select.append(h('option', { value: '', text: '—' }));
  for (const p of BUILTIN_PRESETS) {
    select.append(h('option', { value: p.id, text: t(p.nameKey) }));
  }
  select.addEventListener('change', () => {
    const preset = BUILTIN_PRESETS.find((p) => p.id === select.value);
    if (!preset) return;
    app.params = cloneParams(preset.params);
    app.refresh();
    app.updateSeedInput();
    select.value = '';
  });
  updaters.push(() => {
    select.value = '';
  });
  return section('section.presets', select);
}

function styleSection(app: App, updaters: (() => void)[]): HTMLElement {
  const wrap = h('div', { class: 'style-cards' });
  const cards: HTMLButtonElement[] = [];
  for (const s of ['silk', 'mesh', 'aurora'] as const) {
    const card = h(
      'button',
      {
        class: 'style-card',
        type: 'button',
        title: t(`style.${s}.hint`),
        onclick: () => {
          app.params.style = s;
          app.refresh();
        },
      },
      h('div', { class: 'style-name' }, t(`style.${s}`)),
    );
    cards.push(card);
    wrap.append(card);
  }
  updaters.push(() => {
    cards.forEach((c, i) => {
      c.classList.toggle('active', app.params.style === ['silk', 'mesh', 'aurora'][i]);
    });
  });
  return section('section.style', wrap);
}

function paletteSection(app: App, updaters: (() => void)[]): HTMLElement {
  const body = h('div', {});

  const countSelect = h('select', { class: 'select' }) as HTMLSelectElement;
  for (let n = MIN_COLORS; n <= MAX_COLORS; n++) countSelect.append(h('option', { value: String(n), text: String(n) }));
  countSelect.addEventListener('change', () => {
    const n = parseInt(countSelect.value, 10);
    const p = app.params.palette;
    while (p.colors.length < n) p.colors.push('#808080');
    while (p.locked.length < n) p.locked.push(false);
    p.colors.length = n;
    p.locked.length = n;
    rerollPalette(app.params, isLightBackground(app.params) ? 'light' : 'dark');
    buildSwatches();
    app.refresh();
  });
  updaters.push(() => {
    countSelect.value = String(app.params.palette.colors.length);
  });

  const rerollBtn = h(
    'button',
    {
      class: 'btn ghost small',
      type: 'button',
      onclick: () => {
        rerollPalette(app.params, isLightBackground(app.params) ? 'light' : 'dark');
        buildSwatches();
        app.refresh();
      },
    },
    '🎲 ' + t('palette.reroll'),
  );

  const head = h('div', { class: 'row' }, h('label', {}, t('palette.count')), countSelect, rerollBtn);
  const swatches = h('div', { class: 'swatches' });

  const buildSwatches = () => {
    clear(swatches);
    app.params.palette.colors.forEach((color, i) => {
      const input = h('input', { type: 'color', value: color }) as HTMLInputElement;
      input.addEventListener('input', () => {
        app.params.palette.colors[i] = input.value;
        app.refresh();
      });
      const lock = h(
        'button',
        {
          class: 'icon-btn' + (app.params.palette.locked[i] ? ' active' : ''),
          type: 'button',
          title: t('palette.lock'),
          onclick: () => {
            app.params.palette.locked[i] = !app.params.palette.locked[i];
            lock.classList.toggle('active', app.params.palette.locked[i]);
          },
        },
        app.params.palette.locked[i] ? '🔒' : '🔓',
      );
      swatches.append(h('div', { class: 'swatch-row' }, input, lock));
    });
  };
  buildSwatches();
  updaters.push(() => buildSwatches());

  body.append(head, swatches);
  return section('section.palette', body);
}

function backgroundSection(app: App, updaters: (() => void)[]): HTMLElement {
  const seg = h('div', { class: 'segmented' });
  const modes = ['dark', 'light', 'custom'] as const;
  const btns = modes.map((m) =>
    h(
      'button',
      {
        class: 'seg-btn',
        type: 'button',
        onclick: () => {
          app.params.background.theme = m;
          app.refresh();
        },
      },
      t(`bg.${m}`),
    ),
  );
  btns.forEach((b) => seg.append(b));

  const colorRow = h('div', { class: 'row' }, h('label', {}, t('bg.color'))) as HTMLDivElement;
  const colorInput = h('input', { type: 'color' }) as HTMLInputElement;
  colorInput.addEventListener('input', () => {
    app.params.background.color = colorInput.value;
    app.refresh();
  });
  colorRow.append(colorInput);

  const share = sliderRow(
    t('bg.share'),
    0,
    1,
    0.01,
    () => app.params.colorShare,
    (v) => {
      app.params.colorShare = v;
      app.refresh();
    },
    (v) => Math.round(v * 100) + '%',
  );
  updaters.push(share.sync);

  updaters.push(() => {
    btns.forEach((b, i) => b.classList.toggle('active', app.params.background.theme === modes[i]));
    colorInput.value = app.params.background.color;
    colorRow.style.display = app.params.background.theme === 'custom' ? '' : 'none';
  });

  return section('section.background', seg, colorRow, share.el);
}

function effectsSection(app: App, updaters: (() => void)[]): HTMLElement {
  const mk = (
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => void,
    format?: (v: number) => string,
  ) => {
    const s = sliderRow(label, min, max, step, get, set, format);
    updaters.push(s.sync);
    return s.el;
  };
  return section(
    'section.effects',
    mk(t('effects.blur'), 0, 1, 0.01, () => app.params.blur, (v) => {
      app.params.blur = v;
      app.refresh();
    }, (v) => Math.round(v * 100) + '%'),
    mk(t('effects.grain'), 0, 1, 0.01, () => app.params.grain.strength, (v) => {
      app.params.grain.strength = v;
      app.refresh();
    }, (v) => Math.round(v * 100) + '%'),
    mk(t('effects.grainSize'), 1, 8, 0.1, () => app.params.grain.size, (v) => {
      app.params.grain.size = v;
      app.refresh();
    }, (v) => v.toFixed(1) + ' px'),
    mk(t('effects.vignette'), 0, 1, 0.01, () => app.params.vignette, (v) => {
      app.params.vignette = v;
      app.refresh();
    }, (v) => Math.round(v * 100) + '%'),
  );
}

function advancedSection(app: App, updaters: (() => void)[]): HTMLElement {
  const hint = h('p', { class: 'hint' }, t('adv.hint'));
  const rows: HTMLElement[] = [];

  const bind = (
    label: string,
    min: number,
    max: number,
    step: number,
    key: 'layers' | 'scale' | 'warp' | 'streaks' | 'intensity',
    format?: (v: number) => string,
  ) => {
    const derived = () => resolveStructure(app.params)[key];
    const s = sliderRow(
      label,
      min,
      max,
      step,
      () => app.params.structure[key] ?? derived(),
      (v) => {
        app.params.structure[key] = v;
        app.refresh();
      },
      format,
    );
    // mark auto-derived values with •
    const val = s.el.querySelector('.slider-val') as HTMLElement;
    const syncMarked = () => {
      s.sync();
      val.classList.toggle('auto', app.params.structure[key] == null);
    };
    updaters.push(syncMarked);
    s.el.querySelector('input')?.addEventListener('input', syncMarked);
    rows.push(s.el);
  };

  bind(t('adv.layers'), 3, 8, 1, 'layers', (v) => String(v));
  bind(t('adv.scale'), 0.5, 2, 0.01, 'scale');
  bind(t('adv.warp'), 0, 2, 0.01, 'warp');
  bind(t('adv.streaks'), 0, 1.5, 0.01, 'streaks');
  bind(t('adv.intensity'), 0.5, 1.5, 0.01, 'intensity');

  const reset = h(
    'button',
    {
      class: 'btn ghost small',
      type: 'button',
      onclick: () => {
        const s = app.params.structure;
        s.layers = s.scale = s.warp = s.streaks = s.intensity = null;
        app.refresh();
      },
    },
    t('adv.reset'),
  );

  return section('section.advanced', hint, ...rows, reset);
}

function canvasSection(app: App, updaters: (() => void)[]): HTMLElement {
  const select = h('select', { class: 'select' }) as HTMLSelectElement;
  for (const p of RES_PRESETS) {
    const label = p.id === 'custom' ? t('bg.custom') : `${p.w} × ${p.h}`;
    select.append(h('option', { value: p.id, text: label }));
  }
  const wInput = h('input', { type: 'number', min: '16', max: String(MAX_DIM), class: 'num' }) as HTMLInputElement;
  const hInput = h('input', { type: 'number', min: '16', max: String(MAX_DIM), class: 'num' }) as HTMLInputElement;

  const setRes = (r: ResolutionChoice) => {
    app.resolution = r;
    app.refresh();
  };

  select.addEventListener('change', () => {
    const p = RES_PRESETS.find((x) => x.id === select.value)!;
    if (p.id === 'custom') {
      setRes({ preset: 'custom', w: clampDim(wInput.valueAsNumber || 1920), h: clampDim(hInput.valueAsNumber || 1080) });
    } else {
      wInput.value = String(p.w);
      hInput.value = String(p.h);
      setRes({ preset: p.id, w: p.w, h: p.h });
    }
  });
  const onDim = () => {
    setRes({ preset: 'custom', w: clampDim(wInput.valueAsNumber), h: clampDim(hInput.valueAsNumber) });
    select.value = 'custom';
  };
  wInput.addEventListener('change', onDim);
  hInput.addEventListener('change', onDim);

  updaters.push(() => {
    select.value = app.resolution.preset;
    wInput.value = String(app.resolution.w);
    hInput.value = String(app.resolution.h);
  });

  const dims = h('div', { class: 'row' }, wInput, h('span', { class: 'x' }, '×'), hInput);
  return section('section.canvas', select, dims);
}

function clampDim(v: number): number {
  if (!Number.isFinite(v)) return 1920;
  return Math.min(MAX_DIM, Math.max(16, Math.round(v)));
}
