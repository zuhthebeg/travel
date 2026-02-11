import { callOpenAI, callOpenAIWithVision, type OpenAIMessage, type OpenAIContentPart } from './assistant/_common';

interface Env {
  OPENAI_API_KEY: string;
  DB: D1Database;
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
  const { message, history, planId, planTitle, planRegion, planStartDate, planEndDate, schedules, userLang, image } = await context.request.json<{
    message: string;
    history: any[];
    planId: number;
    planTitle: string;
    planRegion: string | null;
    planStartDate: string;
    planEndDate: string;
    schedules: any[];
    userLang?: string;
    image?: string; // base64 data URL
  }>();

  if (!message && !image) {
    return new Response(JSON.stringify({ error: 'Message or image is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ reply: 'AI Assistant is not configured.' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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

  const scheduleSummary = (schedules || [])
    .map(s => `[ID:${s.id}] ${s.date}${s.time ? ' ' + s.time : ''}: ${s.title}${s.place ? ' @ ' + s.place : ''}`)
    .join('\n');

  const imageInstructions = image ? `
IMAGE ANALYSIS:
When the user sends an image, analyze it in the context of their travel:
- Identify the location, landmark, or scene
- Relate it to their travel plan (${planRegion || 'their destination'})
- Suggest relevant activities or provide interesting facts
- If it's a menu/sign, translate or explain it
- If it's a map/directions, provide guidance
- Can also add the location as a schedule if user asks` : '';

  const systemPrompt = `You are a travel assistant that can CHAT, ANALYZE IMAGES, and MODIFY schedules.

TRAVEL PLAN:
- Title: ${planTitle}
- Region: ${planRegion || 'N/A'}
- Dates: ${planStartDate} to ${planEndDate}
- Schedules:
${scheduleSummary || '(No schedules)'}
${imageInstructions}

RESPONSE FORMAT:
Always respond with JSON:
{
  "reply": "Your conversational response in ${outputLang}",
  "actions": []
}

ACTIONS (only when user asks to modify schedules):
- ADD: {"type": "add", "schedule": {"date": "YYYY-MM-DD", "time": "HH:MM", "title": "...", "place": "...", "memo": ""}}
- UPDATE: {"type": "update", "id": <schedule_id>, "changes": {"title": "...", "time": "...", ...}}
- DELETE: {"type": "delete", "id": <schedule_id>}

RULES:
1. For normal chat (questions, suggestions, image analysis), just reply with empty actions: []
2. For schedule modifications, include appropriate actions
3. Always confirm what you're doing in the reply
4. Use schedule IDs from the list above
5. Reply in ${outputLang}
6. Be friendly and helpful!
7. Keep responses concise (1-3 sentences) for voice readability

Examples:
- "오후 3시에 해운대 추가해줘" → ADD action with date, time, place
- "첫번째 일정 삭제해줘" → DELETE action with id
- "점심 시간을 1시로 바꿔줘" → UPDATE action with id and time change
- "부산 맛집 추천해줘" → Just reply, no actions
- [Image of landmark] → Analyze and describe, no actions unless asked`;

  const messages: OpenAIMessage[] = [{ role: 'system', content: systemPrompt }];

  // Add history
  for (const msg of (history || [])) {
    const content = msg.parts?.map((p: any) => p.text).join('') || msg.content || '';
    if (content) {
      messages.push({ role: msg.role === 'model' ? 'assistant' : msg.role, content });
    }
  }

  // Build user message with optional image
  if (image) {
    const userContent: OpenAIContentPart[] = [];
    
    if (message) {
      userContent.push({ type: 'text', text: message });
    } else {
      userContent.push({ type: 'text', text: '이 사진을 분석해주세요. 여행과 관련된 정보가 있다면 알려주세요.' });
    }
    
    userContent.push({
      type: 'image_url',
      image_url: {
        url: image, // base64 data URL
        detail: 'low' // Use low detail to reduce token usage
      }
    });
    
    messages.push({ role: 'user', content: userContent });
  } else {
    messages.push({ role: 'user', content: message });
  }

  try {
    // Use vision API if image is present, otherwise regular API
    const apiCall = image ? callOpenAIWithVision : callOpenAI;
    const response = await apiCall(apiKey, messages, {
      temperature: 0.7,
      maxTokens: 1500,
      responseFormat: 'json_object',
    });

    const parsed = JSON.parse(response);
    const reply = parsed.reply || response;
    const actions = parsed.actions || [];

    // Execute actions if any
    const results: any[] = [];
    for (const action of actions) {
      try {
        if (action.type === 'add' && action.schedule) {
          const s = action.schedule;
          const result = await context.env.DB.prepare(
            `INSERT INTO schedules (plan_id, date, time, title, place, memo, plan_b, plan_c, order_index)
             VALUES (?, ?, ?, ?, ?, ?, '', '', 0)`
          ).bind(planId, s.date, s.time || null, s.title, s.place || null, s.memo || null).run();
          results.push({ type: 'add', success: true, id: result.meta?.last_row_id });
        } else if (action.type === 'update' && action.id) {
          const changes = action.changes || {};
          const sets: string[] = [];
          const values: any[] = [];
          for (const [key, val] of Object.entries(changes)) {
            if (['title', 'place', 'memo', 'time', 'date', 'plan_b', 'plan_c'].includes(key)) {
              sets.push(`${key} = ?`);
              values.push(val);
            }
          }
          if (sets.length > 0) {
            values.push(action.id);
            await context.env.DB.prepare(
              `UPDATE schedules SET ${sets.join(', ')} WHERE id = ?`
            ).bind(...values).run();
            results.push({ type: 'update', success: true, id: action.id });
          }
        } else if (action.type === 'delete' && action.id) {
          await context.env.DB.prepare('DELETE FROM schedules WHERE id = ?').bind(action.id).run();
          results.push({ type: 'delete', success: true, id: action.id });
        }
      } catch (e) {
        console.error('Action failed:', action, e);
        results.push({ type: action.type, success: false, error: String(e) });
      }
    }

    // Collect modified schedule IDs for scroll/highlight
    const modifiedIds = results
      .filter(r => r.success && r.id)
      .map(r => r.id);

    return new Response(JSON.stringify({ 
      reply, 
      actions: results,
      hasChanges: results.length > 0,
      modifiedScheduleIds: modifiedIds
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (error) {
    console.error('Assistant error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get response' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
};
