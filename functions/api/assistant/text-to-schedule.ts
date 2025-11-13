import { callGemini } from './_common';

interface Env {
  GEMINI_API_KEY: string;
}

export async function textToSchedule(apiKey: string, text: string, planContext: any) {
  const { planTitle, planRegion, planStartDate, planEndDate, currentDate, currentTime, userLocation } = planContext;

  const locationInfo = userLocation?.city ? ` (Current user location: ${userLocation.city})` : '';

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

    CURRENT REAL-TIME CONTEXT (Asia/Seoul timezone):
    - Current Date: ${currentDate || 'N/A'}
    - Current Time: ${currentTime || 'N/A'}
    - User is actively traveling and adding schedules in real-time${locationInfo}

    Travel Plan Context:
    - Title: ${planTitle || 'N/A'}
    - Region: ${planRegion || 'N/A'}
    - Start Date: ${planStartDate || 'N/A'}
    - End Date: ${planEndDate || 'N/A'}

    CRITICAL INSTRUCTIONS FOR TIME AND DATE:
    1. **DEFAULT TO CURRENT TIME/DATE**: If the user does NOT explicitly specify a date or time, ALWAYS use the current date (${currentDate}) and current time (${currentTime}).
    2. The user is traveling NOW and adding schedules in real-time during their trip.
    3. When the user says "지금", "now", "현재", "방금", "just now", or similar temporal words, use CURRENT date and time.
    4. If the text is ambiguous about timing (e.g., "점심 먹음", "카페 갔다옴"), assume it happened NOW and use current date/time.
    5. Only use a different date/time if the user EXPLICITLY mentions:
       - A specific date (e.g., "1월 15일", "내일", "어제")
       - A specific time (e.g., "3시", "오후 2시 30분")
    6. "오늘" (today) = ${currentDate}
    7. "지금" (now) = ${currentTime}

    LOCATION INSTRUCTIONS:
    - If user location is available and the text doesn't specify a place, consider using nearby landmarks or the current city${locationInfo}
    - Provide title and place in Korean

    Based on the above context, parse the following text and create a schedule:
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
