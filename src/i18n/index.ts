import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import koCommon from './locales/ko/common.json';
import enCommon from './locales/en/common.json';
import jaCommon from './locales/ja/common.json';
import zhTWCommon from './locales/zh-TW/common.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'zh-TW', label: '繁體中文', flag: '🇹🇼' },
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
    },
    defaultNS: 'common',
    fallbackLng: 'ko',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  });

export default i18n;
