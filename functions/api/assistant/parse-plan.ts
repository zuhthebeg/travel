import { callOpenAI, type OpenAIMessage } from './_common';

interface Env {
  OPENAI_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { text, currentTime, userLocation } = await context.request.json<{
    text: string;
    currentTime?: string;
    userLocation?: { lat: number; lng: number; city?: string };
  }>();

  if (!text) {
    return new Response(JSON.stringify({ error: 'Text is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your-openai-api-key-here') {
    return new Response(JSON.stringify({ error: 'AI Assistant is not configured.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Detect input language
  const detectLanguage = (t: string) => {
    if (/[\uAC00-\uD7AF]/.test(t)) return 'Korean';
    if (/[\u3040-\u30FF]/.test(t)) return 'Japanese';
    if (/[\u4E00-\u9FFF]/.test(t)) return 'Chinese';
    return 'Korean';
  };
  const outputLang = detectLanguage(text);

  // Get tomorrow as default start
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultStart = tomorrow.toISOString().split('T')[0];

  const systemPrompt = `You are a travel plan parser. Parse user input and extract travel information.

Output ONLY valid JSON:
{
  "title": "여행 제목",
  "region": "목적지",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "schedules": [...]
}

CRITICAL DATE RULES:
1. If user specifies exact dates, use EXACTLY those dates
2. If user says "3일" or "3박4일" without dates, start from ${defaultStart}
3. NEVER change or ignore user-specified dates
4. Dates must be logical (end >= start)

SCHEDULE GENERATION RULES:
1. If input contains DETAILED itinerary (times, places, activities), parse it exactly as given
2. If input is MINIMAL (just "부산 3일"), generate reasonable schedules:
   - 2-3 activities per day
   - Morning (09:00-10:00), Afternoon (14:00-15:00), Evening (18:00-19:00)
   - Use real famous places for the destination
3. ALL text in ${outputLang}

Schedule format:
{
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "title": "활동명",
  "place": "장소",
  "memo": "",
  "plan_b": "",
  "plan_c": ""
}`;

  const userPrompt = `Current time: ${currentTime || new Date().toISOString()}
Default start date if not specified: ${defaultStart}

Parse this travel plan:
---
${text}
---`;

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    const reply = await callOpenAI(apiKey, messages, {
      temperature: 0.3,
      maxTokens: 3000,
      responseFormat: 'json_object',
    });

    const parsedPlan = JSON.parse(reply);
    return new Response(JSON.stringify(parsedPlan), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Failed to parse plan:', error);
    return new Response(JSON.stringify({ error: 'Failed to parse travel plan' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
