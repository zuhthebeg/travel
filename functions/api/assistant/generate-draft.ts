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

  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key-here') {
    return new Response(JSON.stringify({ error: 'AI Assistant is not configured.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
    You are a travel planner. Generate a travel plan draft for a trip to ${destination}
    from ${start_date} to ${end_date}.

    The output should be a valid JSON array of schedule objects, with the following format:
    [
      {"date": "YYYY-MM-DD", "title": "Activity Title", "place": "Location"},
      ...
    ]

    Make sure the JSON is well-formed and contains no other text or explanations.
    The dates in the schedule should be within the provided start and end dates.
    Generate a reasonable number of activities for the given duration.
  `;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.7,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const draftText = data.candidates[0].content.parts[0].text;
    const schedules = JSON.parse(draftText).map((s: any) => ({ ...s, plan_id }));

    // Here you would typically save the schedules to the database.
    // For now, we'll just return them.
    // const createdSchedules = await context.env.DB.batch(
    //   schedules.map(s => context.env.DB.prepare('INSERT INTO schedules (plan_id, date, title, place) VALUES (?, ?, ?, ?)').bind(s.plan_id, s.date, s.title, s.place))
    // );

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
