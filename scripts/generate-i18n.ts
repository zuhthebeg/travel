/**
 * Generate i18n translation files using Gemini API
 * Usage: npx tsx scripts/generate-i18n.ts
 */

import fs from 'fs';
import path from 'path';

const GEMINI_GATEWAY_URL = 'https://gateway.ai.cloudflare.com/v1/3d0681b782422e56226a0a1df4a0e8b2/travly-ai-gateway/google-ai-studio';
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error('Set GEMINI_API_KEY env variable');
  process.exit(1);
}

const LANGUAGES = [
  { code: 'zh-CN', name: 'Simplified Chinese', flag: '🇨🇳' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese (Brazil)', flag: '🇧🇷' },
  { code: 'th', name: 'Thai', flag: '🇹🇭' },
  { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
  { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
  { code: 'ms', name: 'Malay', flag: '🇲🇾' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
];

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');

async function callGemini(prompt: string): Promise<string> {
  const response = await fetch(
    `${GEMINI_GATEWAY_URL}/v1beta/models/gemini-2.5-flash:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY! },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 30000,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini ${response.status}: ${err.substring(0, 300)}`);
  }

  const data = await response.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function translateChunk(enJson: string, langName: string, chunkIndex: number): Promise<any> {
  const prompt = `Translate this JSON i18n file from English to ${langName}.
Rules:
- Return ONLY valid JSON (same structure, translated values)
- Keep all keys in English exactly as they are
- Translate only the string values
- Keep emoji, numbers, URLs, template variables like {{count}} unchanged
- Use natural ${langName} phrasing (not literal translation)
- For place name examples in placeholders, use well-known places in ${langName}-speaking countries

JSON to translate (chunk ${chunkIndex}):
${enJson}`;

  const result = await callGemini(prompt);
  try {
    return JSON.parse(result);
  } catch {
    // Try to extract JSON
    const match = result.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Failed to parse JSON for ${langName} chunk ${chunkIndex}`);
  }
}

function splitJson(obj: Record<string, any>, maxKeys: number = 30): Record<string, any>[] {
  const keys = Object.keys(obj);
  const chunks: Record<string, any>[] = [];
  for (let i = 0; i < keys.length; i += maxKeys) {
    const chunk: Record<string, any> = {};
    for (const key of keys.slice(i, i + maxKeys)) {
      chunk[key] = obj[key];
    }
    chunks.push(chunk);
  }
  return chunks;
}

async function main() {
  const enPath = path.join(LOCALES_DIR, 'en', 'common.json');
  const enJson = JSON.parse(fs.readFileSync(enPath, 'utf-8'));

  // Split into chunks to avoid token limits
  const chunks = splitJson(enJson, 15);
  console.log(`English source: ${Object.keys(enJson).length} top-level keys, ${chunks.length} chunks`);

  for (const lang of LANGUAGES) {
    const outDir = path.join(LOCALES_DIR, lang.code);
    const outPath = path.join(outDir, 'common.json');

    // Skip if already exists
    if (fs.existsSync(outPath)) {
      console.log(`⏭️  ${lang.code} (${lang.name}) - already exists, skipping`);
      continue;
    }

    console.log(`\n🌐 Translating to ${lang.name} (${lang.code})...`);

    let fullTranslation: Record<string, any> = {};
    for (let i = 0; i < chunks.length; i++) {
      const chunkStr = JSON.stringify(chunks[i], null, 2);
      console.log(`  Chunk ${i + 1}/${chunks.length} (${Object.keys(chunks[i]).length} keys)...`);

      try {
        const translated = await translateChunk(chunkStr, lang.name, i + 1);
        fullTranslation = { ...fullTranslation, ...translated };
      } catch (err) {
        console.error(`  ❌ Failed chunk ${i + 1}: ${err}`);
        // Use English as fallback for failed chunk
        fullTranslation = { ...fullTranslation, ...chunks[i] };
      }

      // Rate limit: wait 2s between chunks
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 2000));
    }

    // Write
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(fullTranslation, null, 2), 'utf-8');
    console.log(`  ✅ ${lang.code}/common.json written (${Object.keys(fullTranslation).length} keys)`);

    // Rate limit between languages
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\n✅ All translations generated!');
  console.log('\nNext steps:');
  console.log('1. Update src/i18n/index.ts to import new locales');
  console.log('2. Add new entries to SUPPORTED_LANGUAGES array');
}

main().catch(console.error);
