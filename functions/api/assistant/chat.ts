import { callOpenAI, type OpenAIMessage } from './_common';

interface Env {
  OPENAI_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { message, history, userLocation, currentTime } = await context.request.json<{
    message: string;
    history?: any[];
    userLocation?: { lat: number; lng: number; city?: string };
    currentTime?: string;
  }>();

  if (!message) {
    return new Response(JSON.stringify({ error: 'Message is required' }), {
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

  // Detect language
  const detectLang = (t: string) => {
    if (/[\uAC00-\uD7AF]/.test(t)) return 'Korean';
    if (/[\u3040-\u30FF]/.test(t)) return 'Japanese';
    if (/[\u4E00-\u9FFF]/.test(t)) return 'Chinese';
    return 'Korean';
  };
  const outputLang = detectLang(message);

  const systemPrompt = `You are a friendly travel advisor assistant helping users plan trips.

USER CONTEXT:
- Current location: ${userLocation?.city || 'Unknown'}
- Current time: ${currentTime || 'Unknown'}

YOUR CAPABILITIES:
1. Recommend travel destinations based on:
   - User's location (suggest places within reasonable travel time)
   - Current season and weather
   - Number of travelers
   - Travel duration
   - Budget considerations

2. Create detailed travel itineraries with:
   - Day-by-day schedules
   - Specific times (09:00, 14:00 format)
   - Place names and activities
   - Local tips and recommendations

3. Answer travel-related questions about:
   - Best times to visit
   - Must-see attractions
   - Local food and restaurants
   - Transportation options
   - Accommodation suggestions

RESPONSE GUIDELINES:
- Always respond in ${outputLang}
- Be concise but helpful
- When recommending destinations, consider travel time from user's location
- When creating itineraries, use this format:
  [목적지] [기간] 여행
  
  1일차
  - 09:00 [장소/활동]
  - 12:00 [장소/활동]
  - 15:00 [장소/활동]
  
  2일차
  ...

- Include specific place names (not generic descriptions)
- Add brief tips or notes where helpful
- If user asks for recommendations, give 2-3 specific options with reasons

EXAMPLE GOOD RESPONSE for "3시간 거리 혼자 갈만한 여행지 추천해줘":
"서울에서 3시간 거리로 혼자 가기 좋은 곳 추천드릴게요!

1. **강릉** (2.5시간) - 경포대, 안목해변 카페거리, 혼자 산책하기 좋아요
2. **전주** (2시간) - 한옥마을, 막걸리골목, 혼밥하기 편한 식당 많음
3. **속초** (2.5시간) - 설악산, 아바이마을, 혼자 트레킹하기 좋음

원하시는 곳 있으면 상세 일정 짜드릴까요?"`;

  const messages: OpenAIMessage[] = [{ role: 'system', content: systemPrompt }];

  // Add history
  for (const msg of (history || [])) {
    const content = msg.parts?.map((p: any) => p.text).join('') || msg.content || '';
    if (content) {
      messages.push({ role: msg.role === 'model' ? 'assistant' : msg.role, content });
    }
  }

  messages.push({ role: 'user', content: message });

  try {
    const reply = await callOpenAI(apiKey, messages, {
      temperature: 0.8,
      maxTokens: 2000,
    });

    return new Response(JSON.stringify({ reply }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Chat error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get response' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
