import { callGemini } from './_common';

interface Env {
  GEMINI_API_KEY: string;
}

export async function textToSchedule(apiKey: string, text: string, planContext: any) {
  const { planTitle, planRegion, planStartDate, planEndDate, currentDate, currentTime, userLocation, userLang } = planContext;

  const locationInfo = userLocation?.city ? ` (Current user location: ${userLocation.city})` : '';

  // Detect language from userLang or default to Korean
  const getLanguageInstructions = (lang: string) => {
    const langCode = lang?.split('-')[0] || 'ko';
    switch (langCode) {
      case 'ko':
        return {
          outputLang: 'Korean (한국어)',
          nowWords: '"지금", "now", "현재", "방금", "just now"',
          todayWords: '"오늘" (today)',
          exampleDate: '"1월 15일", "내일", "어제"',
          exampleTime: '"3시", "오후 2시 30분"',
          exampleAmbiguous: '"점심 먹음", "카페 갔다옴"'
        };
      case 'en':
        return {
          outputLang: 'English',
          nowWords: '"now", "just now", "right now", "currently"',
          todayWords: '"today"',
          exampleDate: '"January 15th", "tomorrow", "yesterday"',
          exampleTime: '"3pm", "2:30pm", "at 3 o\'clock"',
          exampleAmbiguous: '"had lunch", "went to cafe"'
        };
      case 'ja':
        return {
          outputLang: 'Japanese (日本語)',
          nowWords: '"今", "いま", "たった今", "現在"',
          todayWords: '"今日" (today)',
          exampleDate: '"1月15日", "明日", "昨日"',
          exampleTime: '"3時", "午後2時30分"',
          exampleAmbiguous: '"昼食を食べた", "カフェに行った"'
        };
      case 'zh':
        return {
          outputLang: lang === 'zh-TW' ? 'Traditional Chinese (繁體中文)' : 'Simplified Chinese (简体中文)',
          nowWords: '"现在", "刚才", "目前", "刚刚"',
          todayWords: '"今天" (today)',
          exampleDate: '"1月15日", "明天", "昨天"',
          exampleTime: '"3点", "下午2点30分"',
          exampleAmbiguous: '"吃了午餐", "去了咖啡厅"'
        };
      default:
        return {
          outputLang: 'Korean (한국어)',
          nowWords: '"now", "지금", "현재"',
          todayWords: '"today", "오늘"',
          exampleDate: '"January 15", "tomorrow", "yesterday"',
          exampleTime: '"3pm", "2:30pm"',
          exampleAmbiguous: '"had lunch", "went to cafe"'
        };
    }
  };

  const langInst = getLanguageInstructions(userLang || 'ko-KR');

  const prompt = `
    You are a travel schedule assistant. Your task is to parse the user's text and create a schedule item.
    The output should be a valid JSON object with the following format:
    {
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "title": "Activity Title in ${langInst.outputLang}",
      "place": "Location in ${langInst.outputLang}",
      "memo": "Notes"
    }

    LANGUAGE: User's preferred language is ${langInst.outputLang}
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
    3. When the user says ${langInst.nowWords}, or similar temporal words, use CURRENT date and time.
    4. If the text is ambiguous about timing (e.g., ${langInst.exampleAmbiguous}), assume it happened NOW and use current date/time.
    5. Only use a different date/time if the user EXPLICITLY mentions:
       - A specific date (e.g., ${langInst.exampleDate})
       - A specific time (e.g., ${langInst.exampleTime})
    6. ${langInst.todayWords} = ${currentDate}
    7. "now" / ${langInst.nowWords} = ${currentTime}

    LOCATION INSTRUCTIONS:
    - If user location is available and the text doesn't specify a place, consider using nearby landmarks or the current city${locationInfo}
    - Provide title and place in ${langInst.outputLang}

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
