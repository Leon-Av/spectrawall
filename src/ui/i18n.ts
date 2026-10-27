import { en } from './locales/en';
import { ru } from './locales/ru';

export type Lang = 'en' | 'ru';

const dict: Record<Lang, Record<string, string>> = { en, ru };

let lang: Lang = 'en';

export function initLang(): Lang {
  const saved = localStorage.getItem('sw.lang');
  if (saved === 'en' || saved === 'ru') {
    lang = saved;
  } else if (navigator.language.toLowerCase().startsWith('ru')) {
    lang = 'ru';
  }
  return lang;
}

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  lang = l;
  localStorage.setItem('sw.lang', l);
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let s = dict[lang][key] ?? dict.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
