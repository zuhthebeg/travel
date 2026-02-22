/**
 * Translation API - Gemini Flash-Lite via CF AI Gateway
 * POST /api/translate
 * { texts: string[], targetLang: "en" | "ja" | "zh-TW" | "ko", sourceLang?: string }
 * Returns: { translations: string[] }
 * 
 * Batch translation to minimize API calls.
 * Uses Gemini 2.0 Flash-Lite for cost efficiency.
 */

const GEMINI_GATEWAY_URL = 'https://gateway.ai.cloudflare.com/v1/3d0681b782422e56226a0a1df4a0e8b2/travly-ai-gateway/google-ai-studio';

interface Env {
  GEMINI_API_KEY: string;
}

const LANG_NAMES: Record<string, string> = {
  ko: 'Korean',
  en: 'English',
  ja: 'Japanese',
  'zh-TW': 'Traditional Chinese (Taiwan)',
};

const SUPPORTED_LANGS = ['ko', 'en', 'ja', 'zh-TW'];

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await context.request.json() as {
      texts: string[];
      targetLang: string;
      sourceLang?: string;
    };

    const { texts, targetLang, sourceLang } = body;

    // Validation
    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return Response.json({ error: 'texts array is required' }, { status: 400, headers: corsHeaders });
    }
    if (texts.length > 20) {
      return Response.json({ error: 'Maximum 20 texts per request' }, { status: 400, headers: corsHeaders });
    }
    if (!targetLang || !SUPPORTED_LANGS.includes(targetLang)) {
      return Response.json({ error: `targetLang must be one of: ${SUPPORTED_LANGS.join(', ')}` }, { status: 400, headers: corsHeaders });
    }

    const apiKey = context.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'Translation service not configured' }, { status: 500, headers: corsHeaders });
    }

    // Filter empty strings, keep track of indices
    const nonEmptyIndices: number[] = [];
    const nonEmptyTexts: string[] = [];
    for (let i = 0; i < texts.length; i++) {
      if (texts[i]?.trim()) {
        nonEmptyIndices.push(i);
        nonEmptyTexts.push(texts[i].trim());
      }
    }

    if (nonEmptyTexts.length === 0) {
      return Response.json({ translations: texts.map(() => '') }, { headers: corsHeaders });
    }

    const targetLangName = LANG_NAMES[targetLang] || targetLang;
    const sourceLangHint = sourceLang ? `from ${LANG_NAMES[sourceLang] || sourceLang} ` : '';

    // Build prompt for batch translation
    const numberedTexts = nonEmptyTexts.map((t, i) => `[${i}] ${t}`).join('\n');

    const prompt = `Translate the following texts ${sourceLangHint}to ${targetLangName}.
Return ONLY a JSON array of translated strings, maintaining the same order and count.
Do not add explanations. Keep proper nouns, emojis, numbers, and formatting as-is.
For place names, use the commonly known name in the target language.

Texts:
${numberedTexts}`;

    // Call Gemini Flash-Lite via AI Gateway
    const response = await fetch(
      `${GEMINI_GATEWAY_URL}/v1beta/models/gemini-2.0-flash-lite:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4000,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini translate error:', response.status, errorText);
      return Response.json({ error: 'Translation failed' }, { status: 502, headers: corsHeaders });
    }

    const data = await response.json() as any;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      return Response.json({ error: 'Empty translation response' }, { status: 502, headers: corsHeaders });
    }

    // Parse JSON array from response
    let translated: string[];
    try {
      translated = JSON.parse(content);
      if (!Array.isArray(translated)) throw new Error('Not an array');
    } catch {
      // Try to extract JSON array from text
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        translated = JSON.parse(match[0]);
      } else {
        console.error('Failed to parse translation:', content);
        return Response.json({ error: 'Failed to parse translation' }, { status: 502, headers: corsHeaders });
      }
    }

    // Rebuild full translations array with empty strings preserved
    const result: string[] = [...texts];
    for (let i = 0; i < nonEmptyIndices.length; i++) {
      result[nonEmptyIndices[i]] = translated[i] || texts[nonEmptyIndices[i]];
    }

    return Response.json({ translations: result }, { headers: corsHeaders });

  } catch (error) {
    console.error('Translation error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
