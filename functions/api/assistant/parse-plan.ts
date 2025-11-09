interface Env {
  GEMINI_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { text } = await context.request.json<{ text: string }>();

  if (!text) {
    return new Response(JSON.stringify({ error: 'Text is required' }), {
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
    You are a travel plan parser. Parse the following text and extract the travel plan information.
    The output should be a valid JSON object with the following format:
    {
      "title": "Travel Plan Title",
      "region": "Travel Region",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "schedules": [
        {"date": "YYYY-MM-DD", "time": "HH:MM", "title": "Activity Title", "place": "Location", "memo": "Notes"},
        ...
      ]
    }

    Make sure the JSON is well-formed and contains no other text or explanations.
    The dates in the schedule should be within the provided start and end dates.
    If the time is not specified, you can leave it as an empty string.
    If there are notes or additional information, include them in the memo field.

    Here is the text to parse:
    ---
    ${text}
    ---
  `;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.2,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const parsedPlan = JSON.parse(data.candidates[0].content.parts[0].text);

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
