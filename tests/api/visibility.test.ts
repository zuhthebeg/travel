import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, authHeaders, cleanup, createTestPlan, loginTestUser } from './helpers';

describe('Plan Visibility API', () => {
  const createdPlanIds: number[] = [];

  let planId = 0;
  let credential = '';

  beforeAll(async () => {
    const user = await loginTestUser(`${Date.now()}_visibility`);
    credential = user.credential;

    const plan = await createTestPlan(user.user.id, `test_visibility_${Date.now()}`);
    planId = plan.id;
    createdPlanIds.push(planId);
  });

  afterAll(async () => {
    await cleanup(createdPlanIds);
  });

  it('visibility 변경 (private → public) 및 변경 확인', async () => {
    const updated = await api<{ plan: { id: number; visibility: string; is_public: number } }>(
      'PUT',
      `/api/plans/${planId}`,
      { visibility: 'public' },
      authHeaders(credential)
    );

    expect(updated.status).toBe(200);
    expect(updated.data.plan.visibility).toBe('public');

    const detail = await api<{ plan: { id: number; visibility: string; is_public: number } }>('GET', `/api/plans/${planId}`);
    expect(detail.status).toBe(200);
    expect(detail.data.plan.visibility).toBe('public');
    expect(Number(detail.data.plan.is_public)).toBe(1);
  });
});
