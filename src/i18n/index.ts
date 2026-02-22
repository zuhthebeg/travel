import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import koCommon from './locales/ko/common.json';
import enCommon from './locales/en/common.json';
import jaCommon from './locales/ja/common.json';
import zhTWCommon from './locales/zh-TW/common.json';
import arCommon from './locales/ar/common.json';
import hiCommon from './locales/hi/common.json';
import ptCommon from './locales/pt/common.json';
import ruCommon from './locales/ru/common.json';
import thCommon from './locales/th/common.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'zh-TW', label: '繁體中文', flag: '🇹🇼' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'th', label: 'ไทย', flag: '🇹🇭' },
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ko: { common: koCommon },
      en: { common: enCommon },
      ja: { common: jaCommon },
      'zh-TW': { common: zhTWCommon },
      ar: { common: arCommon },
      hi: { common: hiCommon },
      pt: { common: ptCommon },
      ru: { common: ruCommon },
      th: { common: thCommon },
    },
    defaultNS: 'common',
    fallbackLng: 'ko',
    supportedLngs: ['ko', 'en', 'ja', 'zh-TW', 'ar', 'hi', 'pt', 'ru', 'th'],
    nonExplicitSupportedLngs: false,
    load: 'currentOnly',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
      convertDetectedLanguage: (lng: string) => {
        // zh-TW, zh-Hant → zh-TW
        if (lng.startsWith('zh-TW') || lng.startsWith('zh-Hant')) return 'zh-TW';
        // zh-anything → fallback to zh-TW (繁體)
        if (lng.startsWith('zh')) return 'zh-TW';
        // ko-KR → ko, en-US → en, ja-JP → ja
        return lng.split('-')[0];
      },
    },
  });

// Update <html lang> on language change
i18n.on('languageChanged', (lng: string) => {
  document.documentElement.lang = lng;
});

export default i18n;
