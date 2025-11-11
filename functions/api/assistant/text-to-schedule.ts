import { callGemini } from './_common';

interface Env {
  GEMINI_API_KEY: string;
}

export async function textToSchedule(apiKey: string, text: string, planContext: any) {
  const { planTitle, planRegion, planStartDate, planEndDate } = planContext; // Removed userLang, destLang

  const prompt = `
    You are a travel schedule assistant. Your task is to parse the user's text and create a schedule item.
    The output should be a valid JSON object with the following format:
    {
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "title": "Activity Title in Korean",
      "place": "Location in Korean",
      "memo": "Notes"
    }

    Here is the context of the current travel plan:
    - Title: ${planTitle || 'N/A'}
    - Region: ${planRegion || 'N/A'}
    - Start Date: ${planStartDate || 'N/A'}
    - End Date: ${planEndDate || 'N/A'}

    Provide the title and place only in Korean.

    Based on the context, parse the following text and create a schedule.
    If the user says "today", it refers to the current date in the context of the travel plan.
    If the date is not specified, try to infer it from the context or use the start date of the plan.
    If the time is not specified, you can leave it as an empty string.

    Here is the text to parse:
    ---
    ${text}
    ---
  `;

  const reply = await callGemini(apiKey, [{ role: 'user', parts: [{ text: prompt }] }], {
    response_mime_type: 'application/json',
    temperature: 0.2,
  });

  return JSON.parse(reply);
}
