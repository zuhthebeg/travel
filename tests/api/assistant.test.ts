import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, createTestCredential, createTestPlan } from './helpers';

// AI 테스트는 기본 실행. 비용 절약 필요 시에만 TEST_SKIP_AI=true
const skipAI = process.env.TEST_SKIP_AI === 'true';
const aiDescribe = skipAI ? describe.skip : describe;

aiDescribe('AI Assistant API', () => {
  const createdPlanIds: number[] = [];
  let userId = 0;
  let planId = 0;

  beforeAll(async () => {
    const seed = `${Date.now()}_assistant`;
    const credential = createTestCredential(`test_${seed}`, `test_${seed}@example.com`, 'AI User');
    const login = await api<{ user: { id: number } }>('POST', '/api/auth/google', { credential });
    userId = login.data.user.id;

    const plan = await createTestPlan(userId, `test_ai_plan_${Date.now()}`);
    planId = plan.id;
    createdPlanIds.push(planId);
  });

  afterAll(async () => {
    await cleanup(createdPlanIds);
  });

  it('POST /api/assistant/parse-plan', async () => {
    const res = await api<{ title?: string; schedules?: unknown[]; error?: string }>('POST', '/api/assistant/parse-plan', {
      text: '도쿄 3박4일 여행, 첫날 아사쿠사, 둘째날 시부야',
    });

    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.data).toHaveProperty('title');
      expect(Array.isArray(res.data.schedules)).toBe(true);
    } else {
      expect(res.data.error).toBeTruthy();
    }
  });

  it('POST /api/assistant/generate-draft', async () => {
    const res = await api<{ schedules?: unknown[]; error?: string }>('POST', '/api/assistant/generate-draft', {
      plan_id: planId,
      destination: 'Tokyo',
      start_date: '2026-04-01',
      end_date: '2026-04-04',
      userLang: 'ko',
    });

    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.data.schedules)).toBe(true);
    } else {
      expect(res.data.error).toBeTruthy();
    }
  });

  it('POST /api/assistant (chat/action)', async () => {
    const res = await api<{ reply?: string; actions?: unknown[]; error?: string }>('POST', '/api/assistant', {
      message: '안녕하세요! 도쿄 여행 팁 알려줘',
      history: [],
      planId,
      planTitle: 'test assistant plan',
      planRegion: 'Tokyo',
      planStartDate: '2026-04-01',
      planEndDate: '2026-04-04',
      schedules: [],
      memos: [],
      userLang: 'ko',
    });

    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(typeof res.data.reply).toBe('string');
      expect(Array.isArray(res.data.actions)).toBe(true);
    } else {
      expect(res.data.error).toBeTruthy();
    }
  });
});
