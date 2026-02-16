import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, createTestCredential } from './helpers';

describe('Plans API CRUD', () => {
  const createdPlanIds: number[] = [];
  let userId = 0;

  beforeAll(async () => {
    const seed = `${Date.now()}_plans`;
    const credential = createTestCredential(`test_${seed}`, `test_${seed}@example.com`, 'Plans User');
    const login = await api<{ user: { id: number } }>('POST', '/api/auth/google', { credential });
    userId = login.data.user.id;
  });

  afterAll(async () => {
    await cleanup(createdPlanIds);
  });

  it('플랜 생성 (정상)', async () => {
    const res = await api<{ plan: { id: number; title: string } }>('POST', '/api/plans', {
      user_id: userId,
      title: `test_plan_${Date.now()}`,
      region: 'Tokyo',
      start_date: '2026-04-01',
      end_date: '2026-04-04',
      is_public: false,
    });

    expect(res.status).toBe(201);
    expect(res.data.plan.id).toBeTypeOf('number');
    createdPlanIds.push(res.data.plan.id);
  });

  it('플랜 생성 (필수 필드 누락) → 에러', async () => {
    const res = await api('POST', '/api/plans', {
      user_id: userId,
      region: 'Tokyo',
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('플랜 목록 조회 (내 것만)', async () => {
    const res = await api<{ plans: Array<{ id: number; user_id: number }> }>('GET', `/api/plans?user_id=${userId}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.plans)).toBe(true);
    expect(res.data.plans.some((p) => p.user_id === userId)).toBe(true);
  });

  it('플랜 상세 조회 / 수정 / 삭제 / 삭제 후 404', async () => {
    const created = await api<{ plan: { id: number } }>('POST', '/api/plans', {
      user_id: userId,
      title: `test_plan_detail_${Date.now()}`,
      region: 'Osaka',
      start_date: '2026-05-01',
      end_date: '2026-05-03',
      is_public: false,
    });
    const planId = created.data.plan.id;

    const detail = await api<{ plan: { id: number; title: string } }>('GET', `/api/plans/${planId}`);
    expect(detail.status).toBe(200);
    expect(detail.data.plan.id).toBe(planId);

    const updatedTitle = `updated_${Date.now()}`;
    const update = await api<{ plan: { title: string } }>('PUT', `/api/plans/${planId}`, {
      title: updatedTitle,
    });
    expect(update.status).toBe(200);
    expect(update.data.plan.title).toBe(updatedTitle);

    const del = await api('DELETE', `/api/plans/${planId}`);
    expect(del.status).toBe(200);

    const afterDelete = await api('GET', `/api/plans/${planId}`);
    expect(afterDelete.status).toBe(404);
  });
});
