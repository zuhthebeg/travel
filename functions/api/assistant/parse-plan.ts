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

  // Detect input language and set output language accordingly
  const detectLanguage = (t: string) => {
    if (/[\uAC00-\uD7AF]/.test(t)) return 'Korean';
    if (/[\u3040-\u30FF]/.test(t)) return 'Japanese';
    if (/[\u4E00-\u9FFF]/.test(t)) return 'Chinese';
    return 'Korean'; // default
  };
  const outputLang = detectLanguage(text);

  const contextInfo = `
Current time: ${currentTime || new Date().toISOString()}
${userLocation?.city ? `User location: ${userLocation.city}` : ''}`;

  const systemPrompt = `You are a travel plan parser and generator. Your job is to:
1. Parse user input (can be minimal like "부산 3일" or detailed itinerary)
2. ALWAYS generate complete schedules with real places and activities
3. Output ONLY valid JSON, no explanations

CRITICAL: Even if input is minimal (e.g., "부산 3일여행"), you MUST generate a full travel plan with schedules!

Output format:
{
  "title": "Travel Plan Title in ${outputLang}",
  "region": "Main destination",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "schedules": [
    {
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "title": "Activity in ${outputLang}",
      "place": "Specific real place name in ${outputLang}",
      "memo": "Tips or notes in ${outputLang}",
      "plan_b": "Alternative if weather is bad",
      "plan_c": ""
    }
  ]
}

RULES:
1. ALL output text must be in ${outputLang}
2. Generate 3-5 activities per day (morning, lunch, afternoon, dinner, evening)
3. Use REAL, SPECIFIC place names (famous spots, restaurants, cafes)
4. If no dates given, start from tomorrow
5. If only duration given (e.g., "3일"), calculate end date from start
6. Include diverse activities: sightseeing, food, shopping, culture
7. Add useful tips in memo field
8. plan_b should be indoor alternatives for bad weather`;

  const userPrompt = `Parse and generate a complete travel plan from this input:
---
${text}
---

Context:${contextInfo}

Remember: Even if the input is very simple, generate a COMPLETE travel plan with detailed schedules!`;

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    const reply = await callOpenAI(apiKey, messages, {
      temperature: 0.7,
      maxTokens: 4000,
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
