import { callOpenAI, callOpenAIWithVision, type OpenAIMessage, type OpenAIContentPart } from './_common';

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
  const { message, history, planId, planTitle, planRegion, planStartDate, planEndDate, schedules, memos, userLang, image } = await context.request.json<{
    message: string;
    history: any[];
    planId: number;
    planTitle: string;
    planRegion: string | null;
    planStartDate: string;
    planEndDate: string;
    schedules: any[];
    memos?: any[]; // Travel memos
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

  // Travel memo categories
  const MEMO_CATEGORIES = ['visa', 'timezone', 'weather', 'currency', 'emergency', 'accommodation', 'transportation', 'custom'];
  const memoSummary = (memos || [])
    .map(m => `[ID:${m.id}] ${m.category}: ${m.title}${m.content ? ' - ' + m.content.substring(0, 50) + (m.content.length > 50 ? '...' : '') : ''}`)
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

  const systemPrompt = `You are a travel assistant that can CHAT, ANALYZE IMAGES, MODIFY schedules, UPDATE plan info, and MANAGE travel memos.

TRAVEL PLAN:
- Plan ID: ${planId}
- Title: ${planTitle}
- Region: ${planRegion || 'N/A'}
- Dates: ${planStartDate} to ${planEndDate}
- Schedules:
${scheduleSummary || '(No schedules)'}
- Travel Memos:
${memoSummary || '(No memos)'}
${imageInstructions}

RESPONSE FORMAT:
Always respond with JSON:
{
  "reply": "Your conversational response in ${outputLang}",
  "actions": []
}

SCHEDULE ACTIONS:
- ADD: {"type": "add", "schedule": {"date": "YYYY-MM-DD", "time": "HH:MM", "title": "...", "place": "장소명, 도시 (예: 디즈니랜드, 애너하임)", "memo": ""}}
  * place MUST include city/region for geocoding accuracy (e.g., "Disneyland, Anaheim" not just "Disneyland")
- UPDATE: {"type": "update", "id": <schedule_id>, "changes": {"title": "...", "time": "...", "date": "...", ...}}
- DELETE: {"type": "delete", "id": <schedule_id>}
- SHIFT_ALL: {"type": "shift_all", "days": <number>} - Move ALL schedules by N days (positive=future, negative=past)
- DELETE_MATCHING: {"type": "delete_matching", "pattern": "transport|이동|버스|택시|공항|비행기|기차|KTX|..."} - Delete schedules matching keyword pattern

PLAN INFO ACTIONS:
- UPDATE_PLAN: {"type": "update_plan", "changes": {"title": "...", "region": "...", "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD"}}

TRAVEL MEMO ACTIONS (for visa, timezone, weather, currency, emergency, accommodation, transportation, custom):
- ADD_MEMO: {"type": "add_memo", "memo": {"category": "visa|timezone|weather|currency|emergency|accommodation|transportation|custom", "title": "...", "content": "...", "icon": "🛂|🕐|🌤️|💱|🆘|🏨|🚗|📝"}}
- UPDATE_MEMO: {"type": "update_memo", "id": <memo_id>, "changes": {"title": "...", "content": "...", "icon": "..."}}
- DELETE_MEMO: {"type": "delete_memo", "id": <memo_id>}
- GENERATE_MEMOS: {"type": "generate_memos"} - Auto-generate travel memos for the destination (visa, timezone, currency, weather, emergency info)

RULES:
1. For normal chat (questions, suggestions, image analysis), just reply with empty actions: []
2. For modifications, include appropriate actions
3. Always confirm what you're doing in the reply
4. Use schedule/memo IDs from the list above when targeting specific items
5. Reply in ${outputLang}
6. Be friendly and helpful!
7. Keep responses concise (1-3 sentences) for voice readability
8. For bulk operations like "10일 뒤로 미뤄줘", use SHIFT_ALL action
9. For "이동 일정 지워줘" type requests, use DELETE_MATCHING with transport-related keywords
10. For "하루에 2개만" type requests, analyze schedules by date and DELETE extras
11. For "여행 정보 준비해줘" or "비자 정보 알려줘", use ADD_MEMO or GENERATE_MEMOS

TRAVEL RECOMMENDATION RULES (CRITICAL):
12. When recommending travel destinations, suggest ONLY ONE destination at a time. Wait for user's response before suggesting another.
13. Maximum 3 schedules per day. Never exceed this limit.
14. Do NOT include obvious/boring schedules like: hotel breakfast, hotel check-in/out, resort dinner, watching TV/movies at hotel, resting at hotel, packing luggage, etc. Only include activities worth planning.
15. Keep total generated schedules SHORT — if too many schedules are generated at once, the next step (schedule creation) will fail due to token limits. Prefer fewer, high-quality schedules.

Examples:
- "오후 3시에 해운대 추가해줘" → ADD action
- "일정 모두 10일 뒤로 미뤄줘" → SHIFT_ALL with days: 10
- "이동 일정 다 지워줘" → DELETE_MATCHING with pattern for transport keywords
- "여행 제목 바꿔줘: 부산 여행" → UPDATE_PLAN with title change
- "비자 정보 추가해줘" → ADD_MEMO with category: visa
- "여행 정보 자동으로 채워줘" → GENERATE_MEMOS (creates visa, timezone, currency, weather, emergency memos)
- "부산 맛집 추천해줘" → Just reply, no actions`;

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

    let parsed: any;
    try {
      parsed = JSON.parse(response);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Response was:', response?.substring(0, 500));
      // If JSON parsing fails, treat the whole response as the reply
      parsed = { reply: response, actions: [] };
    }
    
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
        } else if (action.type === 'shift_all' && typeof action.days === 'number') {
          // Shift all schedules by N days
          const shiftDays = action.days;
          await context.env.DB.prepare(
            `UPDATE schedules SET date = date(date, ? || ' days') WHERE plan_id = ?`
          ).bind(shiftDays > 0 ? '+' + shiftDays : String(shiftDays), planId).run();
          // Also update plan dates
          await context.env.DB.prepare(
            `UPDATE plans SET start_date = date(start_date, ? || ' days'), end_date = date(end_date, ? || ' days') WHERE id = ?`
          ).bind(shiftDays > 0 ? '+' + shiftDays : String(shiftDays), shiftDays > 0 ? '+' + shiftDays : String(shiftDays), planId).run();
          results.push({ type: 'shift_all', success: true, days: shiftDays });
        } else if (action.type === 'delete_matching' && action.pattern) {
          // Delete schedules matching pattern (case insensitive)
          const keywords = action.pattern.split('|').map((k: string) => k.trim().toLowerCase());
          const allSchedules = await context.env.DB.prepare(
            `SELECT id, title, place, memo FROM schedules WHERE plan_id = ?`
          ).bind(planId).all();
          
          let deletedCount = 0;
          for (const sched of allSchedules.results || []) {
            const searchText = `${sched.title || ''} ${sched.place || ''} ${sched.memo || ''}`.toLowerCase();
            if (keywords.some((kw: string) => searchText.includes(kw))) {
              await context.env.DB.prepare('DELETE FROM schedules WHERE id = ?').bind(sched.id).run();
              deletedCount++;
            }
          }
          results.push({ type: 'delete_matching', success: true, count: deletedCount });
        } else if (action.type === 'update_plan' && action.changes) {
          // Update plan info (title, region, dates)
          const changes = action.changes;
          const sets: string[] = [];
          const values: any[] = [];
          for (const [key, val] of Object.entries(changes)) {
            if (['title', 'region', 'start_date', 'end_date', 'country', 'country_code'].includes(key)) {
              sets.push(`${key} = ?`);
              values.push(val);
            }
          }
          if (sets.length > 0) {
            values.push(planId);
            await context.env.DB.prepare(
              `UPDATE plans SET ${sets.join(', ')} WHERE id = ?`
            ).bind(...values).run();
            results.push({ type: 'update_plan', success: true });
          }
        } else if (action.type === 'add_memo' && action.memo) {
          // Add travel memo
          const m = action.memo;
          const result = await context.env.DB.prepare(
            `INSERT INTO travel_memos (plan_id, category, title, content, icon, order_index)
             VALUES (?, ?, ?, ?, ?, 0)`
          ).bind(planId, m.category, m.title, m.content || null, m.icon || null).run();
          results.push({ type: 'add_memo', success: true, id: result.meta?.last_row_id });
        } else if (action.type === 'update_memo' && action.id) {
          // Update travel memo
          const changes = action.changes || {};
          const sets: string[] = [];
          const values: any[] = [];
          for (const [key, val] of Object.entries(changes)) {
            if (['title', 'content', 'icon', 'category'].includes(key)) {
              sets.push(`${key} = ?`);
              values.push(val);
            }
          }
          if (sets.length > 0) {
            values.push(action.id);
            await context.env.DB.prepare(
              `UPDATE travel_memos SET ${sets.join(', ')} WHERE id = ?`
            ).bind(...values).run();
            results.push({ type: 'update_memo', success: true, id: action.id });
          }
        } else if (action.type === 'delete_memo' && action.id) {
          // Delete travel memo
          await context.env.DB.prepare('DELETE FROM travel_memos WHERE id = ?').bind(action.id).run();
          results.push({ type: 'delete_memo', success: true, id: action.id });
        } else if (action.type === 'generate_memos') {
          // Auto-generate travel memos for destination
          // This is handled by creating multiple ADD_MEMO actions in the AI response
          // The AI should generate multiple add_memo actions instead
          results.push({ type: 'generate_memos', success: true, note: 'AI should generate individual add_memo actions' });
        }
      } catch (e) {
        console.error('Action failed:', action, e);
        results.push({ type: action.type, success: false, error: String(e) });
      }
    }

    // Collect modified schedule IDs for scroll/highlight
    const modifiedIds = results
      .filter(r => r.success && r.id && ['add', 'update', 'delete'].includes(r.type))
      .map(r => r.id);

    // Check if any memo actions were performed
    const hasMemoChanges = results.some(r => 
      r.success && ['add_memo', 'update_memo', 'delete_memo', 'generate_memos'].includes(r.type)
    );

    return new Response(JSON.stringify({ 
      reply, 
      actions: results,
      hasChanges: results.length > 0,
      hasMemoChanges,
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
