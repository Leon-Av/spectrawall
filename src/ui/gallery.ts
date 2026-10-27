/**
 * History gallery overlay.
 */

import { h, clear, toast, copyText, download, fileInput } from './dom';
import { t } from './i18n';
import type { App } from './types';
import type { HistoryEntry, HistoryStore } from '../core/history';
import { parseCollection, serializeCollection } from '../core/history';
import { cloneParams } from '../core/params';

export function openHistoryDialog(app: App, history: HistoryStore): void {
  const overlay = h('div', { class: 'overlay' });
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const grid = h('div', { class: 'gallery-grid' });
  const empty = h('p', { class: 'hint' }, t('history.empty'));

  const refreshGrid = async () => {
    clear(grid);
    const entries = await history.list();
    empty.style.display = entries.length === 0 ? '' : 'none';
    for (const entry of entries) grid.append(card(entry));
  };

  const card = (entry: HistoryEntry): HTMLElement => {
    const load = () => {
      app.params = cloneParams(entry.params);
      app.refresh();
      app.updateSeedInput();
      close();
    };
    const thumbEl = entry.thumb
      ? h('img', { class: 'thumb', src: entry.thumb, alt: entry.params.seed })
      : h('div', { class: 'thumb empty' }, '·');
    return h(
      'div',
      { class: 'gallery-card' },
      h('div', { class: 'thumb-wrap', onclick: load }, thumbEl),
      h('div', { class: 'card-meta' },
        h('div', { class: 'card-seed', title: entry.params.seed }, entry.params.seed),
        h('div', { class: 'card-date' }, new Date(entry.createdAt).toLocaleString()),
      ),
      h('div', { class: 'card-actions' },
        h('button', { class: 'btn ghost small', type: 'button', onclick: load }, t('history.open')),
        h('button', {
          class: 'btn ghost small',
          type: 'button',
          onclick: async () => {
            if (await copyText(entry.params.seed)) toast(t('toast.seedCopied'));
          },
        }, t('history.copySeed')),
        h('button', {
          class: 'btn ghost small danger',
          type: 'button',
          onclick: async () => {
            if (!confirm(t('history.confirmDelete'))) return;
            await history.delete(entry.id);
            await refreshGrid();
          },
        }, '✕'),
      ),
    );
  };

  const autosaveCb = h('input', { type: 'checkbox', id: 'autosave-cb' }) as HTMLInputElement;
  autosaveCb.checked = app.autosave;
  autosaveCb.addEventListener('change', () => {
    app.autosave = autosaveCb.checked;
  });
  const autosaveLabel = h('label', { class: 'checkbox' }, autosaveCb, h('span', {}, t('history.autosave')));

  const toolbar = h(
    'div',
    { class: 'row wrap' },
    h('button', {
      class: 'btn ghost small',
      type: 'button',
      onclick: () =>
        fileInput('application/json', async (f) => {
          try {
            const entries = parseCollection(await f.text());
            for (const e of entries) await history.put(e);
            await refreshGrid();
            toast(t('toast.imported', { n: entries.length }));
          } catch {
            toast(t('toast.importFailed'));
          }
        }),
    }, t('history.import')),
    h('button', {
      class: 'btn ghost small',
      type: 'button',
      onclick: async () => {
        const entries = await history.list();
        const blob = new Blob([serializeCollection(entries)], { type: 'application/json' });
        download(blob, `spectrawall-history-${new Date().toISOString().slice(0, 10)}.json`);
      },
    }, t('history.exportAll')),
    h('button', {
      class: 'btn ghost small danger',
      type: 'button',
      onclick: async () => {
        if (!confirm(t('history.confirmClear'))) return;
        await history.clear();
        await refreshGrid();
      },
    }, t('history.clearAll')),
    h('span', { class: 'spacer' }),
    autosaveLabel,
    h('button', { class: 'btn ghost small', type: 'button', onclick: close }, t('btn.close')),
  );

  const dialog = h(
    'div',
    { class: 'dialog wide' },
    h('div', { class: 'dialog-title' }, t('history.title')),
    toolbar,
    empty,
    grid,
  );
  overlay.append(dialog);
  document.getElementById('overlay-root')!.append(overlay);
  void refreshGrid();
}
