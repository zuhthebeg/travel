import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, authHeaders, cleanup, createTestPlan, loginTestUser } from './helpers';

describe('Plan Fork API', () => {
  const createdPlanIds: number[] = [];

  let ownerCredential = '';
  let forkerCredential = '';
  let sourcePlanId = 0;
  let sourceScheduleId = 0;

  beforeAll(async () => {
    const owner = await loginTestUser(`${Date.now()}_fork_owner`);
    ownerCredential = owner.credential;

    const forker = await loginTestUser(`${Date.now()}_fork_user`);
    forkerCredential = forker.credential;

    const sourcePlan = await createTestPlan(owner.user.id, `test_fork_source_${Date.now()}`);
    sourcePlanId = sourcePlan.id;
    createdPlanIds.push(sourcePlanId);

    const schedule = await api<{ schedule: { id: number } }>('POST', '/api/schedules', {
      plan_id: sourcePlanId,
      date: '2026-03-11',
      time: '11:00',
      title: '시부야 스크램블',
      place: 'Shibuya',
      order_index: 1,
    });
    expect(schedule.status).toBe(201);
    sourceScheduleId = schedule.data.schedule.id;

    const moment = await api(
      'POST',
      `/api/schedules/${sourceScheduleId}/moments`,
      {
        note: '원본 플랜의 모먼트',
        mood: 'good',
        revisit: 'yes',
      },
      authHeaders(ownerCredential)
    );
    expect(moment.status).toBe(201);

    const toPublic = await api('PUT', `/api/plans/${sourcePlanId}`, { visibility: 'public' });
    expect(toPublic.status).toBe(200);
  });

  afterAll(async () => {
    await cleanup(createdPlanIds);
  });

  it('플랜 fork + 스케줄 복사 + forked_from 확인 + moments 미복사 확인', async () => {
    const fork = await api<{ plan: { id: number; forked_from: number }; schedules_copied: number; forked_from: number }>(
      'POST',
      `/api/plans/${sourcePlanId}/fork`,
      {},
      authHeaders(forkerCredential)
    );

    expect(fork.status).toBe(201);
    expect(fork.data.plan.id).toBeTypeOf('number');
    expect(fork.data.forked_from).toBe(sourcePlanId);

    const forkedPlanId = fork.data.plan.id;
    createdPlanIds.push(forkedPlanId);

    const forkedPlanDetail = await api<{ plan: { id: number; forked_from: number } }>('GET', `/api/plans/${forkedPlanId}`);
    expect(forkedPlanDetail.status).toBe(200);
    expect(forkedPlanDetail.data.plan.forked_from).toBe(sourcePlanId);

    const sourceSchedules = await api<{ schedules: Array<{ id: number; title: string }> }>('GET', `/api/schedules?plan_id=${sourcePlanId}`);
    const forkedSchedules = await api<{ schedules: Array<{ id: number; title: string }> }>('GET', `/api/schedules?plan_id=${forkedPlanId}`);

    expect(sourceSchedules.status).toBe(200);
    expect(forkedSchedules.status).toBe(200);
    expect(forkedSchedules.data.schedules.length).toBe(sourceSchedules.data.schedules.length);

    const sourceTitles = sourceSchedules.data.schedules.map((s) => s.title).sort();
    const forkedTitles = forkedSchedules.data.schedules.map((s) => s.title).sort();
    expect(forkedTitles).toEqual(sourceTitles);

    for (const schedule of forkedSchedules.data.schedules) {
      const moments = await api<{ moments: Array<{ id: number }>; count: number }>('GET', `/api/schedules/${schedule.id}/moments`);
      expect(moments.status).toBe(200);
      expect(moments.data.count).toBe(0);
      expect(moments.data.moments.length).toBe(0);
    }
  });
});
