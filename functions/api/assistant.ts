import { callGemini } from './assistant/_common';

interface Env {
  GEMINI_API_KEY: string;
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
  const { message, history, planId, planTitle, planRegion, planStartDate, planEndDate, schedules, systemPrompt: receivedSystemPrompt } = await context.request.json<{
    message: string;
    history: any[];
    planId: number;
    planTitle: string;
    planRegion: string | null;
    planStartDate: string;
    planEndDate: string;
    schedules: any[]; // Adjust type as needed
    systemPrompt: string; // Receive the systemPrompt from frontend
  }>();

  if (!message) {
    return new Response(JSON.stringify({ error: 'Message is required' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key-here') {
    return new Response(JSON.stringify({ reply: 'AI Assistant is not configured.' }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Use the received systemPrompt instead of constructing it here
  const systemPromptToUse = receivedSystemPrompt || `You are a friendly and helpful travel assistant. Your goal is to help users plan their trips.
  The current travel plan is for "${planTitle}" in "${planRegion}" from ${planStartDate} to ${planEndDate}.
  The plan currently has the following schedules:
  ${(schedules || []).map(s => `- ${s.date}: ${s.title} at ${s.place}`).join('\n')}
  You can provide information about destinations, suggest activities, and help with scheduling.
  Keep your answers concise and helpful, always referring to the provided plan context.
  All responses should be in Korean.`; // Fallback in case frontend doesn't send it

  // Convert history roles from "assistant" to "model" for Gemini API
  const convertedHistory = history.map((msg: any) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: msg.parts,
  }));

  // Always include system prompt at the beginning for context
  const contents = [
    {
      role: 'user',
      parts: [{ text: systemPromptToUse }],
    },
    ...convertedHistory,
    {
      role: 'user',
      parts: [{ text: message }],
    },
  ];

  try {
    const reply = await callGemini(apiKey, contents, {
      temperature: 0.7,
      maxOutputTokens: 1000,
    });

    return new Response(JSON.stringify({ reply }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Failed to call Gemini API:', error);
    return new Response(JSON.stringify({ error: 'Failed to get response from AI assistant' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};
