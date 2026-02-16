import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, createTestCredential, createTestPlan } from './helpers';

describe('Travel Memos API', () => {
  const createdPlanIds: number[] = [];
  let userId = 0;
  let planId = 0;

  beforeAll(async () => {
    const seed = `${Date.now()}_memos`;
    const credential = createTestCredential(`test_${seed}`, `test_${seed}@example.com`, 'Memo User');
    const login = await api<{ user: { id: number } }>('POST', '/api/auth/google', { credential });
    userId = login.data.user.id;

    const plan = await createTestPlan(userId, `test_memo_plan_${Date.now()}`);
    planId = plan.id;
    createdPlanIds.push(planId);
  });

  afterAll(async () => {
    await cleanup(createdPlanIds);
  });

  it('메모 CRUD 전체 + 카테고리별 조회', async () => {
    const visa = await api<{ id: number }>('POST', `/api/plans/${planId}/memos`, {
      category: 'visa',
      title: '비자 필요 여부',
      content: '일본은 무비자 입국 가능',
      icon: '🛂',
    });
    const weather = await api<{ id: number }>('POST', `/api/plans/${planId}/memos`, {
      category: 'weather',
      title: '날씨 체크',
      content: '우산 준비',
      icon: '🌤️',
    });

    expect(visa.status).toBe(200);
    expect(weather.status).toBe(200);

    const visaId = visa.data.id;

    const list = await api<{ memos: Array<{ id: number; category: string; title: string }> }>('GET', `/api/plans/${planId}/memos`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.data.memos)).toBe(true);
    expect(list.data.memos.length).toBeGreaterThanOrEqual(2);

    const byCategory = list.data.memos.reduce<Record<string, number>>((acc, m) => {
      acc[m.category] = (acc[m.category] || 0) + 1;
      return acc;
    }, {});
    expect(byCategory.visa).toBeGreaterThanOrEqual(1);
    expect(byCategory.weather).toBeGreaterThanOrEqual(1);

    const update = await api<{ success: boolean }>('PUT', `/api/plans/${planId}/memos/${visaId}`, {
      title: '비자/입국 서류 확인',
      content: '여권 유효기간 6개월 이상 확인',
    });
    expect(update.status).toBe(200);
    expect(update.data.success).toBe(true);

    const del = await api<{ success: boolean }>('DELETE', `/api/plans/${planId}/memos/${visaId}`);
    expect(del.status).toBe(200);
    expect(del.data.success).toBe(true);
  });
});
