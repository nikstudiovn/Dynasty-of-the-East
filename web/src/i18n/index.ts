import vi from "./vi.json";
import en from "./en.json";

export type Lang = "vi" | "en";

const STORAGE_KEY = "dote_lang";
const LEGACY_STORAGE_KEY = "pd_lang";
const DICTIONARIES: Record<Lang, Record<string, string>> = {
  vi: vi as Record<string, string>,
  en: en as Record<string, string>,
};
let currentLang: Lang = "vi";

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  const lang = saved ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  if (lang === "vi" || lang === "en") {
    currentLang = lang;
    if (saved === null) localStorage.setItem(STORAGE_KEY, lang);
  }
} catch {
  // Ignore storage errors in restricted environments
}

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: "vi" | "en"): void {
  currentLang = lang;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, lang);
    }
  } catch {
    // Ignore storage errors in restricted environments
  }
}

export function t(key: string, fallback?: string): string {
  const dict = DICTIONARIES[currentLang] || DICTIONARIES.vi;
  if (Object.prototype.hasOwnProperty.call(dict, key)) {
    return dict[key];
  }
  const enDict = DICTIONARIES.en;
  if (Object.prototype.hasOwnProperty.call(enDict, key)) {
    return enDict[key];
  }
  return fallback !== undefined ? fallback : key;
}
