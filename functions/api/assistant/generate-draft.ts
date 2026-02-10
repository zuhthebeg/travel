import { callOpenAI, type OpenAIMessage } from './_common';
import type { Env } from '../../types';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { plan_id, destination, start_date, end_date, userLang } = await context.request.json<{
    plan_id: number;
    destination: string;
    start_date: string;
    end_date: string;
    userLang?: string;
  }>();

  if (!plan_id || !destination || !start_date || !end_date) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
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

  // Calculate trip duration
  const startDate = new Date(start_date);
  const endDate = new Date(end_date);
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // Detect language
  const lang = userLang?.startsWith('ko') ? 'Korean' : 
               userLang?.startsWith('ja') ? 'Japanese' :
               userLang?.startsWith('zh') ? 'Chinese' : 'Korean';

  const systemPrompt = `You are an expert travel planner. Generate detailed, realistic travel schedules.

CRITICAL RULES:
1. Output ONLY valid JSON with this format: {"schedules": [...]}
2. Each schedule: {"date": "YYYY-MM-DD", "time": "HH:MM", "title": "Activity", "place": "Location", "memo": "Tips"}
3. Generate 3-5 activities per day (morning, afternoon, evening)
4. Use realistic times (breakfast 8-9AM, lunch 12-1PM, dinner 6-8PM)
5. ALL text (title, place, memo) must be in ${lang}
6. Include specific, real place names (famous restaurants, landmarks, attractions)
7. Consider travel time between locations
8. Include diverse activities: sightseeing, food, culture, shopping, relaxation

NO explanations, ONLY the JSON object.`;

  const userPrompt = `Create a ${days}-day travel schedule for ${destination}.
Travel dates: ${start_date} to ${end_date}

Requirements:
- Include famous landmarks and must-visit spots in ${destination}
- Add popular local restaurants and cafes
- Mix tourist attractions with local experiences
- Consider the typical weather and best times for each activity
- Add brief tips or recommendations in the memo field

Generate a complete, detailed itinerary that a real traveler can follow.`;

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    const draftText = await callOpenAI(apiKey, messages, {
      temperature: 0.8,
      maxTokens: 4000,
      responseFormat: 'json_object',
    });

    // Parse and add plan_id to each schedule
    let schedules;
    try {
      const parsed = JSON.parse(draftText);
      const scheduleArray = Array.isArray(parsed) ? parsed : parsed.schedules || [];
      schedules = scheduleArray.map((s: any) => ({ ...s, plan_id }));
    } catch (parseError) {
      console.error('Failed to parse AI response:', draftText);
      throw new Error('Failed to parse AI response as JSON');
    }

    return new Response(JSON.stringify({ schedules }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Failed to generate draft:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate travel draft' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
