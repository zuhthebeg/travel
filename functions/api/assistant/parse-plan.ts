import { callOpenAI, type OpenAIMessage } from './_common';

interface Env {
  OPENAI_API_KEY: string;
}

// 텍스트를 일(day) 단위로 분할
function splitByDays(text: string): string[] {
  // Day, DAY, 1일차, 2일차, etc.
  const dayPatterns = [
    /(?=\n\s*(?:DAY|Day|day)\s*\d)/gi,
    /(?=\n\s*\d+일차)/g,
    /(?=\n\s*(?:첫째|둘째|셋째|넷째|다섯째|여섯째|일곱째|여덟째)날)/g,
  ];
  
  let chunks: string[] = [text];
  
  for (const pattern of dayPatterns) {
    const newChunks: string[] = [];
    for (const chunk of chunks) {
      const parts = chunk.split(pattern).filter(p => p.trim());
      if (parts.length > 1) {
        newChunks.push(...parts);
      } else {
        newChunks.push(chunk);
      }
    }
    if (newChunks.length > chunks.length) {
      chunks = newChunks;
    }
  }
  
  return chunks;
}

// 청크들을 그룹으로 묶기 (각 그룹 최대 문자수 제한)
function groupChunks(chunks: string[], maxChars: number = 3000): string[][] {
  const groups: string[][] = [];
  let currentGroup: string[] = [];
  let currentLength = 0;
  
  for (const chunk of chunks) {
    if (currentLength + chunk.length > maxChars && currentGroup.length > 0) {
      groups.push(currentGroup);
      currentGroup = [chunk];
      currentLength = chunk.length;
    } else {
      currentGroup.push(chunk);
      currentLength += chunk.length;
    }
  }
  
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  
  return groups;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { text, currentTime, userLocation } = await context.request.json<{
    text: string;
    currentTime?: string;
    userLocation?: { lat: number; lng: number; city?: string };
  }>();

  if (!text) {
    return new Response(JSON.stringify({ error: 'Text is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your-openai-api-key-here') {
    return new Response(JSON.stringify({ error: 'AI Assistant is not configured.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Detect input language
  const detectLanguage = (t: string) => {
    if (/[\uAC00-\uD7AF]/.test(t)) return 'Korean';
    if (/[\u3040-\u30FF]/.test(t)) return 'Japanese';
    if (/[\u4E00-\u9FFF]/.test(t)) return 'Chinese';
    return 'Korean';
  };
  const outputLang = detectLanguage(text);

  // Get tomorrow as default start
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultStart = tomorrow.toISOString().split('T')[0];

  const systemPrompt = `You are a travel plan parser. Parse user input and extract travel information.

Output ONLY valid JSON:
{
  "title": "여행 제목",
  "region": "목적지",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "schedules": [...]
}

TITLE RULES (CRITICAL):
1. ALWAYS generate a descriptive title
2. Format: "[목적지] [기간] 여행" (예: "부산 3일 여행", "제주도 2박3일 가족여행")
3. Include purpose if mentioned (출장, 가족여행, 신혼여행, etc.)
4. NEVER leave title empty or generic like "새 여행"

CRITICAL DATE RULES:
1. If user specifies exact dates, use EXACTLY those dates
2. If user says "3일" or "3박4일" without dates, start from ${defaultStart}
3. NEVER change or ignore user-specified dates
4. Dates must be logical (end >= start)

SCHEDULE GENERATION RULES:
1. If input contains DETAILED itinerary (times, places, activities), parse it exactly as given
2. If input is MINIMAL (just "부산 3일"), generate reasonable schedules:
   - 2-3 activities per day
   - Morning (09:00-10:00), Afternoon (14:00-15:00), Evening (18:00-19:00)
   - Use REAL famous places for the destination (search your knowledge)
3. ALL text in ${outputLang}
4. IMPORTANT - place field MUST include region/city for disambiguation:
   - ❌ Bad: "디즈니랜드" (ambiguous - could be any country)
   - ✅ Good: "디즈니랜드 캘리포니아, 애너하임" or "Disneyland California, Anaheim"
   - ❌ Bad: "유니버설 스튜디오" (ambiguous)
   - ✅ Good: "유니버설 스튜디오 할리우드, LA"
   - Always add city/region after landmark names

Schedule format:
{
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "title": "활동명",
  "place": "장소명, 도시/지역 (예: 에펠탑, 파리 / 디즈니랜드 캘리포니아, 애너하임)",
  "memo": "",
  "plan_b": "",
  "plan_c": ""
}`;

  const userPrompt = `Current time: ${currentTime || new Date().toISOString()}
Default start date if not specified: ${defaultStart}

Parse this travel plan:
---
${text}
---`;

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // 텍스트가 4000자 이상이면 청크로 분할 처리
  const MAX_SINGLE_CALL = 4000;
  
  if (text.length > MAX_SINGLE_CALL) {
    console.log(`Long text detected (${text.length} chars), splitting into chunks...`);
    
    try {
      // Step 1: 첫 청크에서 기본 정보 추출 (title, region, dates)
      const chunks = splitByDays(text);
      const groups = groupChunks(chunks, 3000);
      
      console.log(`Split into ${groups.length} groups from ${chunks.length} day chunks`);
      
      // 첫 그룹 + 전체 텍스트 요약으로 기본 정보 추출
      const headerPrompt = `Parse this travel plan and extract ONLY the metadata (no schedules yet):
---
${text.substring(0, 2000)}
---

Output ONLY:
{
  "title": "여행 제목 (format: [목적지] [기간] 여행)",
  "region": "목적지",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD"
}`;

      const headerMessages: OpenAIMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: headerPrompt },
      ];
      
      const headerReply = await callOpenAI(apiKey, headerMessages, {
        temperature: 0.3,
        maxTokens: 500,
        responseFormat: 'json_object',
      });
      
      const headerData = JSON.parse(headerReply);
      const allSchedules: any[] = [];
      
      // Step 2: 각 그룹별로 일정만 추출
      for (let i = 0; i < groups.length; i++) {
        const groupText = groups[i].join('\n\n');
        const schedulePrompt = `Parse ONLY the schedules from this part of the travel plan.
Region: ${headerData.region || 'unknown'}
Start date: ${headerData.start_date || defaultStart}

---
${groupText}
---

Output ONLY:
{
  "schedules": [
    {"date": "YYYY-MM-DD", "time": "HH:MM", "title": "활동명", "place": "장소", "memo": "", "plan_b": "", "plan_c": ""}
  ]
}`;

        const scheduleMessages: OpenAIMessage[] = [
          { role: 'system', content: `Extract schedules from travel plans. Output JSON only. All text in ${outputLang}.` },
          { role: 'user', content: schedulePrompt },
        ];
        
        try {
          const scheduleReply = await callOpenAI(apiKey, scheduleMessages, {
            temperature: 0.3,
            maxTokens: 2000,
            responseFormat: 'json_object',
          });
          
          const scheduleData = JSON.parse(scheduleReply);
          if (scheduleData.schedules && Array.isArray(scheduleData.schedules)) {
            allSchedules.push(...scheduleData.schedules);
          }
        } catch (e) {
          console.error(`Failed to parse group ${i + 1}:`, e);
        }
      }
      
      const finalResult = {
        ...headerData,
        schedules: allSchedules,
      };
      
      console.log(`Parsed ${allSchedules.length} schedules from ${groups.length} groups`);
      
      return new Response(JSON.stringify(finalResult), {
        headers: { 'Content-Type': 'application/json' },
      });
      
    } catch (error) {
      console.error('Failed to parse chunked plan:', error);
      return new Response(JSON.stringify({ error: 'Failed to parse travel plan (chunked)' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // 일반 처리 (4000자 이하)
  try {
    const reply = await callOpenAI(apiKey, messages, {
      temperature: 0.3,
      maxTokens: 4000, // 3000 → 4000으로 증가
      responseFormat: 'json_object',
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
