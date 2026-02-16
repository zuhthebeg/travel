import { callOpenAI, callOpenAIWithVision, type OpenAIMessage, type OpenAIContentPart } from './_common';
import { getRequestUser, checkPlanAccess, type AccessLevel } from '../../lib/auth';
import { canExecute } from '../../lib/assistant-acl';

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
  const { message, history, planId, planTitle, planRegion, planStartDate, planEndDate, schedules, memos, moments, members, visibility, userLang, image } = await context.request.json<{
    message: string;
    history: any[];
    planId: number;
    planTitle: string;
    planRegion: string | null;
    planStartDate: string;
    planEndDate: string;
    schedules: any[];
    memos?: any[];
    moments?: any[];
    members?: any[];
    visibility?: string;
    userLang?: string;
    image?: string;
  }>();

  if (!message && !image) {
    return new Response(JSON.stringify({ error: 'Message or image is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Auth: 로그인 필수 + owner 또는 member만
  const user = await getRequestUser(context.request, context.env.DB);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
  const access: AccessLevel = await checkPlanAccess(context.env.DB, planId, user.id);
  if (!access || access === 'public') {
    return new Response(JSON.stringify({ error: 'Access denied' }), {
      status: 403,
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

  // Moments 요약 (schedule당 count + 최근 1개만)
  const momentSummary = (moments || [])
    .map((m: any) => `[MomentID:${m.id}] Schedule ${m.schedule_id}: ${m.mood || ''} "${(m.note || '').substring(0, 60)}" ${m.revisit ? '(revisit:' + m.revisit + ')' : ''}`)
    .join('\n');

  // Members 요약
  const memberSummary = (members || [])
    .map((m: any) => `[UserID:${m.user_id}] ${m.name || m.email || 'unknown'} (${m.role})`)
    .join('\n');

  // 현재 사용자의 role 전달
  const userRole = access === 'owner' ? 'OWNER' : 'MEMBER';

  const imageInstructions = image ? `
IMAGE ANALYSIS:
When the user sends an image, analyze it in the context of their travel:
- Identify the location, landmark, or scene
- Relate it to their travel plan (${planRegion || 'their destination'})
- Suggest relevant activities or provide interesting facts
- If it's a menu/sign, translate or explain it
- If it's a map/directions, provide guidance
- Can also add the location as a schedule if user asks` : '';

  const systemPrompt = `You are a travel assistant that can CHAT, ANALYZE IMAGES, MODIFY schedules, UPDATE plan info, MANAGE travel memos, and RECORD moments.

CURRENT USER ROLE: ${userRole}
${userRole === 'MEMBER' ? '⚠️ As a MEMBER, you can ONLY: chat, add_moment, update_moment (own), delete_moment (own). All other actions are BLOCKED.' : ''}

TRAVEL PLAN:
- Plan ID: ${planId}
- Title: ${planTitle}
- Region: ${planRegion || 'N/A'}
- Dates: ${planStartDate} to ${planEndDate}
- Schedules:
${scheduleSummary || '(No schedules)'}
- Travel Memos:
${memoSummary || '(No memos)'}
- Visibility: ${visibility || 'private'}
- Members:
${memberSummary || '(No members)'}
- Moments:
${momentSummary || '(No moments)'}
${imageInstructions}

RESPONSE FORMAT:
Always respond with JSON:
{
  "reply": "Your conversational response in ${outputLang}",
  "actions": []
}

SCHEDULE ACTIONS:
- ADD: {"type": "add", "schedule": {"date": "YYYY-MM-DD", "time": "HH:MM", "title": "...", "place": "장소명, 도시", "place_en": "Place Name, City (English)", "memo": ""}}
  * place: Korean display name (e.g., "디즈니랜드, 애너하임")
  * place_en: ALWAYS include English translation for geocoding (e.g., "Disneyland, Anaheim")
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

MOMENT ACTIONS (순간 기록 - 일정에 대한 감상/메모):
- ADD_MOMENT: {"type": "add_moment", "schedule_id": <schedule_id>, "moment": {"note": "200자 이내", "mood": "amazing|good|okay|meh|bad", "revisit": "yes|no|maybe"}}
- UPDATE_MOMENT: {"type": "update_moment", "id": <moment_id>, "changes": {"note": "...", "mood": "...", "revisit": "..."}}
- DELETE_MOMENT: {"type": "delete_moment", "id": <moment_id>}

MEMBER ACTIONS (owner only):
- ADD_MEMBER: {"type": "add_member", "email": "user@example.com"}
- REMOVE_MEMBER: {"type": "remove_member", "user_id": <user_id>}

VISIBILITY ACTION (owner only):
- SET_VISIBILITY: {"type": "set_visibility", "visibility": "private|shared|public"}

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

REALISTIC SCHEDULING RULES (CRITICAL):
12. Do NOT spread across too many cities in a short trip:
    - 1-2 day trip: ONE city only
    - 3-4 days: max 1-2 cities
    - 5-7 days: max 2-3 cities
    - Moving between cities = half a day minimum
13. Max 3 activities per day in actions. No filler (breakfast, check-in/out, rest, packing)
14. When adding schedules, use dates within the plan range (${planStartDate} to ${planEndDate})

CONVERSATION & RECOMMENDATION RULES (CRITICAL):
15. When recommending travel destinations, suggest ONLY ONE destination at a time. Wait for user's confirmation or "more" before suggesting another.
16. Keep reply text SHORT and concise. 1-3 sentences + action if needed.
17. When suggesting itinerary ideas in conversation (not as actions), keep it brief: list 2-3 highlights max, not a full day-by-day breakdown.

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

    // Execute actions with ACL pre-check
    const results: any[] = [];
    for (const action of actions) {
      try {
        // ACL 1차 게이트: 역할 기반 차단
        if (!canExecute(action.type, access)) {
          results.push({ type: action.type, success: false, error: 'Permission denied' });
          continue;
        }

        if (action.type === 'add' && action.schedule) {
          const s = action.schedule;
          const result = await context.env.DB.prepare(
            `INSERT INTO schedules (plan_id, date, time, title, place, place_en, memo, plan_b, plan_c, order_index)
             VALUES (?, ?, ?, ?, ?, ?, ?, '', '', 0)`
          ).bind(planId, s.date, s.time || null, s.title, s.place || null, s.place_en || null, s.memo || null).run();
          results.push({ type: 'add', success: true, id: result.meta?.last_row_id });
        } else if (action.type === 'update' && action.id) {
          const changes = action.changes || {};
          const sets: string[] = [];
          const values: any[] = [];
          for (const [key, val] of Object.entries(changes)) {
            if (['title', 'place', 'place_en', 'memo', 'time', 'date', 'plan_b', 'plan_c'].includes(key)) {
              sets.push(`${key} = ?`);
              values.push(val);
            }
          }
          if (sets.length > 0) {
            values.push(action.id, planId);
            await context.env.DB.prepare(
              `UPDATE schedules SET ${sets.join(', ')} WHERE id = ? AND plan_id = ?`
            ).bind(...values).run();
            results.push({ type: 'update', success: true, id: action.id });
          }
        } else if (action.type === 'delete' && action.id) {
          await context.env.DB.prepare('DELETE FROM schedules WHERE id = ? AND plan_id = ?').bind(action.id, planId).run();
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
              await context.env.DB.prepare('DELETE FROM schedules WHERE id = ? AND plan_id = ?').bind(sched.id, planId).run();
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
            values.push(planId, user.id);
            await context.env.DB.prepare(
              `UPDATE plans SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`
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
          // Update travel memo — plan_id 스코프
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
            values.push(action.id, planId);
            await context.env.DB.prepare(
              `UPDATE travel_memos SET ${sets.join(', ')} WHERE id = ? AND plan_id = ?`
            ).bind(...values).run();
            results.push({ type: 'update_memo', success: true, id: action.id });
          }
        } else if (action.type === 'delete_memo' && action.id) {
          // Delete travel memo — plan_id 스코프
          await context.env.DB.prepare('DELETE FROM travel_memos WHERE id = ? AND plan_id = ?').bind(action.id, planId).run();
          results.push({ type: 'delete_memo', success: true, id: action.id });
        } else if (action.type === 'generate_memos') {
          results.push({ type: 'generate_memos', success: true, note: 'AI should generate individual add_memo actions' });

        // ── MOMENT ACTIONS ──
        } else if (action.type === 'add_moment' && action.schedule_id && action.moment) {
          // schedule이 이 plan 소속인지 확인
          const sched = await context.env.DB.prepare(
            'SELECT id FROM schedules WHERE id = ? AND plan_id = ?'
          ).bind(action.schedule_id, planId).first();
          if (!sched) {
            results.push({ type: 'add_moment', success: false, error: 'Schedule not in this plan' });
          } else {
            const m = action.moment;
            const result = await context.env.DB.prepare(
              `INSERT INTO moments (schedule_id, user_id, note, mood, revisit) VALUES (?, ?, ?, ?, ?)`
            ).bind(action.schedule_id, user.id, m.note || null, m.mood || null, m.revisit || null).run();
            results.push({ type: 'add_moment', success: true, id: result.meta?.last_row_id });
          }
        } else if (action.type === 'update_moment' && action.id) {
          const changes = action.changes || {};
          const sets: string[] = [];
          const values: any[] = [];
          for (const [key, val] of Object.entries(changes)) {
            if (['note', 'mood', 'revisit'].includes(key)) {
              sets.push(`${key} = ?`);
              values.push(val);
            }
          }
          if (sets.length > 0) {
            // owner는 모든 moment 수정 가능, member는 본인만
            const ownerCondition = access === 'owner' ? '' : ' AND user_id = ' + user.id;
            values.push(action.id);
            await context.env.DB.prepare(
              `UPDATE moments SET ${sets.join(', ')} WHERE id = ?${ownerCondition}
               AND schedule_id IN (SELECT id FROM schedules WHERE plan_id = ?)`
            ).bind(...values, planId).run();
            results.push({ type: 'update_moment', success: true, id: action.id });
          }
        } else if (action.type === 'delete_moment' && action.id) {
          const ownerCondition = access === 'owner' ? '' : ' AND user_id = ' + user.id;
          await context.env.DB.prepare(
            `DELETE FROM moments WHERE id = ?${ownerCondition}
             AND schedule_id IN (SELECT id FROM schedules WHERE plan_id = ?)`
          ).bind(action.id, planId).run();
          results.push({ type: 'delete_moment', success: true, id: action.id });

        // ── MEMBER ACTIONS ──
        } else if (action.type === 'add_member' && action.email) {
          const target = await context.env.DB.prepare(
            'SELECT id FROM users WHERE LOWER(email) = LOWER(?)'
          ).bind(action.email).first<{ id: number }>();
          if (!target) {
            results.push({ type: 'add_member', success: false, error: 'User not found' });
          } else if (target.id === user.id) {
            results.push({ type: 'add_member', success: false, error: 'Cannot add yourself' });
          } else {
            await context.env.DB.prepare(
              'INSERT INTO plan_members (plan_id, user_id, role) VALUES (?, ?, ?) ON CONFLICT DO NOTHING'
            ).bind(planId, target.id, 'member').run();
            results.push({ type: 'add_member', success: true, user_id: target.id });
          }
        } else if (action.type === 'remove_member' && action.user_id) {
          if (action.user_id === user.id) {
            results.push({ type: 'remove_member', success: false, error: 'Cannot remove yourself' });
          } else {
            await context.env.DB.prepare(
              'DELETE FROM plan_members WHERE plan_id = ? AND user_id = ? AND role != ?'
            ).bind(planId, action.user_id, 'owner').run();
            results.push({ type: 'remove_member', success: true, user_id: action.user_id });
          }

        // ── VISIBILITY ACTION ──
        } else if (action.type === 'set_visibility' && action.visibility) {
          if (['private', 'shared', 'public'].includes(action.visibility)) {
            await context.env.DB.prepare(
              'UPDATE plans SET visibility = ? WHERE id = ? AND user_id = ?'
            ).bind(action.visibility, planId, user.id).run();
            results.push({ type: 'set_visibility', success: true, visibility: action.visibility });
          } else {
            results.push({ type: 'set_visibility', success: false, error: 'Invalid visibility' });
          }
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

    const hasMemoChanges = results.some(r => 
      r.success && ['add_memo', 'update_memo', 'delete_memo', 'generate_memos'].includes(r.type)
    );
    const hasMomentChanges = results.some(r =>
      r.success && ['add_moment', 'update_moment', 'delete_moment'].includes(r.type)
    );
    const hasMemberChanges = results.some(r =>
      r.success && ['add_member', 'remove_member'].includes(r.type)
    );
    const hasVisibilityChange = results.some(r =>
      r.success && r.type === 'set_visibility'
    );

    return new Response(JSON.stringify({ 
      reply, 
      actions: results,
      hasChanges: results.length > 0,
      hasMemoChanges,
      hasMomentChanges,
      hasMemberChanges,
      hasVisibilityChange,
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
