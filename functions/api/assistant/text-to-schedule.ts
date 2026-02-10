import { callOpenAI, type OpenAIMessage } from './_common';

interface Env {
  OPENAI_API_KEY: string;
}

export async function textToSchedule(apiKey: string, text: string, planContext: any) {
  const { planTitle, planRegion, planStartDate, planEndDate, currentDate, currentTime, userLocation, userLang } = planContext;

  // Detect language from text
  const detectLanguage = (t: string, langHint?: string) => {
    if (langHint?.startsWith('ko') || /[\uAC00-\uD7AF]/.test(t)) return 'Korean';
    if (langHint?.startsWith('ja') || /[\u3040-\u30FF]/.test(t)) return 'Japanese';
    if (langHint?.startsWith('zh') || /[\u4E00-\u9FFF]/.test(t)) return 'Chinese';
    return 'Korean';
  };
  const outputLang = detectLanguage(text, userLang);

  const locationInfo = userLocation?.city ? ` (User is currently in: ${userLocation.city})` : '';

  const systemPrompt = `You are a travel schedule parser. Parse user input and create a schedule item.

Output ONLY valid JSON with this format:
{
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "title": "Activity title in ${outputLang}",
  "place": "Specific location in ${outputLang}",
  "memo": "Notes in ${outputLang}"
}

RULES:
1. ALL text must be in ${outputLang}
2. If no date specified, use current date: ${currentDate}
3. If no time specified but context suggests timing (점심, lunch, 저녁, dinner), use appropriate time
4. If ambiguous timing, use current time: ${currentTime}
5. Use real, specific place names when possible
6. Extract any tips or notes for the memo field`;

  const userPrompt = `Current context:
- Date: ${currentDate}
- Time: ${currentTime}
- Travel: "${planTitle}" in ${planRegion} (${planStartDate} to ${planEndDate})${locationInfo}

Parse this into a schedule:
---
${text}
---`;

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const reply = await callOpenAI(apiKey, messages, {
    temperature: 0.3,
    responseFormat: 'json_object',
  });

  return JSON.parse(reply);
}
