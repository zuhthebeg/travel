import { textToSchedule } from '../assistant/text-to-schedule';

interface Env {
  GEMINI_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { text, planId, userLang, destLang, planTitle, planRegion, planStartDate, planEndDate } = await context.request.json<{
    text: string;
    planId: number;
    userLang: string;
    destLang: string;
    planTitle: string;
    planRegion: string;
    planStartDate: string;
    planEndDate: string;
  }>();

  if (!text || !planId || !userLang || !destLang || !planTitle || !planRegion || !planStartDate || !planEndDate) {
    return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key-here') {
    return new Response(JSON.stringify({ error: 'AI Assistant is not configured.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const schedule = await textToSchedule(apiKey, text, {
      userLang,
      destLang,
      planTitle,
      planRegion,
      planStartDate,
      planEndDate,
    });

    // Here you would typically save the schedule to your database
    // For now, we'll just return the parsed schedule
    return new Response(JSON.stringify({ ...schedule, plan_id: planId }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Failed to create schedule from text:', error);
    return new Response(JSON.stringify({ error: 'Failed to create schedule from text' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
