import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, createTestCredential, createTestPlan } from './helpers';

describe('Schedules API CRUD', () => {
  const createdPlanIds: number[] = [];
  let userId = 0;
  let planId = 0;

  beforeAll(async () => {
    const seed = `${Date.now()}_schedules`;
    const credential = createTestCredential(`test_${seed}`, `test_${seed}@example.com`, 'Schedules User');
    const login = await api<{ user: { id: number } }>('POST', '/api/auth/google', { credential });
    userId = login.data.user.id;

    const plan = await createTestPlan(userId, `test_schedule_plan_${Date.now()}`);
    planId = plan.id;
    createdPlanIds.push(planId);
  });

  afterAll(async () => {
    await cleanup(createdPlanIds);
  });

  it('스케줄 생성 / 목록 / 수정(lat/lng 포함) / 삭제', async () => {
    const created = await api<{ schedule: { id: number } }>('POST', '/api/schedules', {
      plan_id: planId,
      date: '2026-03-10',
      time: '10:00',
      title: '도쿄타워 방문',
      place: 'Tokyo Tower',
      order_index: 1,
    });

    expect(created.status).toBe(201);
    const scheduleId = created.data.schedule.id;

    const list = await api<{ schedules: Array<{ id: number }> }>('GET', `/api/schedules?plan_id=${planId}`);
    expect(list.status).toBe(200);
    expect(list.data.schedules.some((s) => s.id === scheduleId)).toBe(true);

    const updated = await api<{ schedule: { latitude: number; longitude: number; place_en: string } }>('PUT', `/api/schedules/${scheduleId}`, {
      latitude: 35.6586,
      longitude: 139.7454,
      place_en: 'Tokyo Tower, Tokyo',
      title: '도쿄타워 야경',
    });

    expect(updated.status).toBe(200);
    expect(Number(updated.data.schedule.latitude)).toBeCloseTo(35.6586, 3);
    expect(Number(updated.data.schedule.longitude)).toBeCloseTo(139.7454, 3);
    expect(updated.data.schedule.place_en).toContain('Tokyo Tower');

    const del = await api('DELETE', `/api/schedules/${scheduleId}`);
    expect(del.status).toBe(200);

    const detail = await api('GET', `/api/schedules/${scheduleId}`);
    expect(detail.status).toBe(404);
  });

  it('존재하지 않는 plan_id로 생성 → 에러', async () => {
    const res = await api('POST', '/api/schedules', {
      plan_id: 999999999,
      date: '2026-03-10',
      title: 'Invalid Plan Test',
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
