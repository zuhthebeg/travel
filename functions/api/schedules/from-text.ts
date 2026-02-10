import { textToSchedule } from '../assistant/text-to-schedule';

interface Env {
  OPENAI_API_KEY: string;
}

// Handle CORS preflight requests
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { text, planId, userLang, destLang, planTitle, planRegion, planStartDate, planEndDate, userLocation } = await context.request.json<{
    text: string;
    planId: number;
    userLang: string;
    destLang: string;
    planTitle: string;
    planRegion: string;
    planStartDate: string;
    planEndDate: string;
    userLocation?: { lat: number; lng: number; city?: string };
  }>();

  if (!text || !planId || !userLang || !destLang || !planTitle || !planRegion || !planStartDate || !planEndDate) {
    return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your-openai-api-key-here') {
    return new Response(JSON.stringify({ error: 'AI Assistant is not configured.' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    // Get current time in Korea timezone
    const now = new Date();
    const koreaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const currentDate = koreaTime.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = koreaTime.toTimeString().slice(0, 5); // HH:MM

    const schedule = await textToSchedule(apiKey, text, {
      userLang,
      destLang,
      planTitle,
      planRegion,
      planStartDate,
      planEndDate,
      currentDate,
      currentTime,
      userLocation,
    });

    // Here you would typically save the schedule to your database
    // For now, we'll just return the parsed schedule
    return new Response(JSON.stringify({ ...schedule, plan_id: planId }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Failed to create schedule from text:', error);
    return new Response(JSON.stringify({ error: 'Failed to create schedule from text' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};
