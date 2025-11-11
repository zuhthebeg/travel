import { callGemini } from './_common';

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

  const prompt = `
    You are a travel plan parser. Parse the following text and extract the travel plan information.
    The output should be a valid JSON object with the following format:
    {
      "title": "Travel Plan Title",
      "region": "Travel Region",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "schedules": [
        {
          "date": "YYYY-MM-DD",
          "time": "HH:MM",
          "title": "Activity Title",
          "place": "Location",
          "memo": "Notes",
          "plan_b": "Alternative plan if weather is bad or place is closed",
          "plan_c": "Another alternative option"
        },
        ...
      ]
    }

    Important instructions:
    - Make sure the JSON is well-formed and contains no other text or explanations.
    - The dates in the schedule should be within the provided start and end dates.
    - If time is not specified, leave it as an empty string.
    - If there are notes or additional information, include them in the memo field.
    - If the text mentions alternative plans (Plan B, 대안, 예비 계획, etc.), extract them to plan_b field.
    - If there are multiple alternatives, put the second one in plan_c field.
    - If no alternatives are mentioned, leave plan_b and plan_c as empty strings.

    Here is the text to parse:
    ---
    ${text}
    ---
  `;

  try {
    const reply = await callGemini(apiKey, [{ role: 'user', parts: [{ text: prompt }] }], {
      response_mime_type: 'application/json',
      temperature: 0.2,
    });

    const parsedPlan = JSON.parse(reply);

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
