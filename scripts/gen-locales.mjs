// Generate i18n locale files using deployed /api/translate endpoint
// Usage: node scripts/gen-locales.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const API = 'https://travel-mvp.pages.dev/api/translate';

const LANGUAGES = [
  { code: 'zh-CN', name: 'Simplified Chinese', flag: '🇨🇳', label: '简体中文' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', label: 'Español' },
  { code: 'fr', name: 'French', flag: '🇫🇷', label: 'Français' },
  { code: 'de', name: 'German', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'it', name: 'Italian', flag: '🇮🇹', label: 'Italiano' },
  { code: 'pt', name: 'Portuguese', flag: '🇧🇷', label: 'Português' },
  { code: 'th', name: 'Thai', flag: '🇹🇭', label: 'ไทย' },
  { code: 'vi', name: 'Vietnamese', flag: '🇻🇳', label: 'Tiếng Việt' },
  { code: 'id', name: 'Indonesian', flag: '🇮🇩', label: 'Bahasa Indonesia' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺', label: 'Русский' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷', label: 'Türkçe' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦', label: 'العربية' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳', label: 'हिन्दी' },
  { code: 'ms', name: 'Malay', flag: '🇲🇾', label: 'Bahasa Melayu' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱', label: 'Nederlands' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱', label: 'Polski' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪', label: 'Svenska' },
];

// Flatten nested JSON to { "nav.home": "Home", ... }
function flatten(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result[fullKey] = value;
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(result, flatten(value, fullKey));
    }
  }
  return result;
}

// Unflatten { "nav.home": "Home" } back to nested { nav: { home: "Home" } }
function unflatten(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split('.');
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }
  return result;
}

async function translateBatch(texts, targetLang) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, targetLang }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.translations;
}

async function main() {
  // Read English source
  const enPath = path.join(LOCALES_DIR, 'en', 'common.json');
  const enJson = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
  const flat = flatten(enJson);
  const keys = Object.keys(flat);
  const values = Object.values(flat);

  console.log(`Source: ${keys.length} strings to translate`);

  for (const lang of LANGUAGES) {
    const outDir = path.join(LOCALES_DIR, lang.code);
    const outPath = path.join(outDir, 'common.json');

    if (fs.existsSync(outPath)) {
      console.log(`⏭️  ${lang.code} already exists, skipping`);
      continue;
    }

    console.log(`\n🌐 ${lang.code} (${lang.name})...`);

    // Translate in batches of 20
    const translated = [];
    for (let i = 0; i < values.length; i += 20) {
      const batch = values.slice(i, i + 20);
      console.log(`  Batch ${Math.floor(i/20)+1}/${Math.ceil(values.length/20)} (${batch.length} strings)...`);

      try {
        const result = await translateBatch(batch, lang.code === 'zh-CN' ? 'zh-TW' : lang.code);
        // zh-CN needs special handling — our API only supports zh-TW
        // We'll handle this separately
        translated.push(...result);
      } catch (err) {
        console.error(`  ❌ Batch failed: ${err.message}`);
        translated.push(...batch); // fallback to English
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 1500));
    }

    // Rebuild JSON
    const translatedFlat = {};
    for (let i = 0; i < keys.length; i++) {
      translatedFlat[keys[i]] = translated[i] || values[i];
    }

    const result = unflatten(translatedFlat);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`  ✅ ${lang.code}/common.json (${keys.length} strings)`);

    // Wait between languages
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n✅ Done! Update i18n/index.ts next.');
}

main().catch(console.error);
