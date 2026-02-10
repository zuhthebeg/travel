import { callOpenAI, type OpenAIMessage } from './_common';
import type { Env } from '../../types';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { plan_id, destination, start_date, end_date } = await context.request.json<{
    plan_id: number;
    destination: string;
    start_date: string;
    end_date: string;
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

  const systemPrompt = `You are a travel planner. Generate travel schedules in JSON format.
Output must be a valid JSON array of schedule objects with this exact format:
[
  {"date": "YYYY-MM-DD", "title": "Activity Title", "place": "Location"},
  ...
]
No explanations, just the JSON array.`;

  const userPrompt = `Generate a travel plan draft for a trip to ${destination} from ${start_date} to ${end_date}.
Generate a reasonable number of activities for the given duration.
The dates in the schedule should be within the provided start and end dates.`;

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    const draftText = await callOpenAI(apiKey, messages, {
      temperature: 0.7,
      responseFormat: 'json_object',
    });

    // Parse and add plan_id to each schedule
    let schedules;
    try {
      const parsed = JSON.parse(draftText);
      // Handle both array and {schedules: [...]} formats
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
