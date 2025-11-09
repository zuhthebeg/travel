interface Env {
  GEMINI_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { message, history } = await context.request.json<{ message: string, history: any[] }>();

  if (!message) {
    return new Response(JSON.stringify({ error: 'Message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key-here') {
    return new Response(JSON.stringify({ reply: 'AI Assistant is not configured.' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const systemPrompt = `You are a friendly and helpful travel assistant. Your goal is to help users plan their trips.
  You can provide information about destinations, suggest activities, and help with scheduling.
  Keep your answers concise and helpful.`;

  const contents = [
    ...history,
    {
      role: 'user',
      parts: [{ text: message }],
    },
  ];

  if (history.length === 0) {
    contents.unshift({
      role: 'user',
      parts: [{ text: systemPrompt }],
    });
  }


  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const reply = data.candidates[0].content.parts[0].text;

    return new Response(JSON.stringify({ reply }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to call Gemini API:', error);
    return new Response(JSON.stringify({ error: 'Failed to get response from AI assistant' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
