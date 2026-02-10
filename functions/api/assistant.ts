import { callOpenAI, type OpenAIMessage } from './assistant/_common';

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
  const { message, history, planId, planTitle, planRegion, planStartDate, planEndDate, schedules, userLang } = await context.request.json<{
    message: string;
    history: any[];
    planId: number;
    planTitle: string;
    planRegion: string | null;
    planStartDate: string;
    planEndDate: string;
    schedules: any[];
    userLang?: string;
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

  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your-openai-api-key-here') {
    return new Response(JSON.stringify({ reply: 'AI Assistant is not configured.' }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Detect language from message or userLang
  const detectLanguage = (text: string, langHint?: string) => {
    if (langHint?.startsWith('ko') || /[\uAC00-\uD7AF]/.test(text)) return 'Korean';
    if (langHint?.startsWith('ja') || /[\u3040-\u30FF]/.test(text)) return 'Japanese';
    if (langHint?.startsWith('zh') || /[\u4E00-\u9FFF]/.test(text)) return 'Chinese';
    if (langHint?.startsWith('en')) return 'English';
    return 'Korean'; // default
  };
  const outputLang = detectLanguage(message, userLang);

  const scheduleSummary = (schedules || [])
    .slice(0, 20) // Limit to prevent token overflow
    .map(s => `- ${s.date}${s.time ? ' ' + s.time : ''}: ${s.title}${s.place ? ' @ ' + s.place : ''}`)
    .join('\n');

  const systemPrompt = `You are a friendly, knowledgeable travel assistant. Help users plan and enjoy their trips.

TRAVEL PLAN CONTEXT:
- Title: ${planTitle}
- Destination: ${planRegion || 'Not specified'}
- Dates: ${planStartDate} to ${planEndDate}
- Current schedules:
${scheduleSummary || '(No schedules yet)'}

INSTRUCTIONS:
1. ALWAYS respond in ${outputLang} - match the user's language exactly
2. Be concise but helpful
3. Suggest specific real places (restaurants, attractions, cafes)
4. Consider the travel dates and local events/weather
5. Help modify schedules if asked
6. Provide practical tips (transport, reservations, local customs)
7. Be enthusiastic and friendly!

You can help with:
- Suggesting activities and places to visit
- Recommending restaurants and cafes
- Providing tips about the destination
- Helping reorganize the schedule
- Answering questions about the area`;

  // Convert history to OpenAI format
  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add conversation history
  for (const msg of (history || [])) {
    const content = msg.parts?.map((p: any) => p.text).join('') || msg.content || '';
    if (content) {
      messages.push({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content,
      });
    }
  }

  // Add current message
  messages.push({ role: 'user', content: message });

  try {
    const reply = await callOpenAI(apiKey, messages, {
      temperature: 0.7,
      maxTokens: 1000,
    });

    return new Response(JSON.stringify({ reply }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Failed to call OpenAI API:', error);
    return new Response(JSON.stringify({ error: 'Failed to get response from AI assistant' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};
