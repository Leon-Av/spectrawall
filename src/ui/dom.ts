/** Tiny DOM helpers for the vanilla-TS UI. */

export type Attrs = Record<string, string | number | boolean | EventListener | ((e: never) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c == null) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function button(text: string, className: string, onClick: (e: MouseEvent) => void): HTMLButtonElement {
  return h('button', { class: className, type: 'button', onclick: onClick }, text);
}

// ---------- toast ----------

export function toast(message: string, ms = 2600): void {
  const root = document.getElementById('toast-root')!;
  const el = h('div', { class: 'toast' }, message);
  root.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 350);
  }, ms);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function fileInput(accept: string, onFile: (file: File) => void): void {
  const input = h('input', { type: 'file', accept, style: 'display:none' }) as HTMLInputElement;
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) onFile(f);
    input.remove();
  });
  document.body.append(input);
  input.click();
}
