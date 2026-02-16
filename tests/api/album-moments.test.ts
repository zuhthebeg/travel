import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, authHeaders, cleanup, createTestPlan, loginTestUser } from './helpers';

describe('Album Moments API', () => {
  const createdPlanIds: number[] = [];

  let credential = '';
  let planId = 0;
  let scheduleId = 0;

  beforeAll(async () => {
    const seed = `${Date.now()}_album_moments`;
    const user = await loginTestUser(seed);
    credential = user.credential;

    const plan = await createTestPlan(user.user.id, `test_album_moments_${Date.now()}`);
    planId = plan.id;
    createdPlanIds.push(planId);

    const createdSchedule = await api<{ schedule: { id: number } }>('POST', '/api/schedules', {
      plan_id: planId,
      date: '2026-03-10',
      time: '09:00',
      title: '아사쿠사 산책',
      place: 'Asakusa',
      order_index: 1,
    });

    expect(createdSchedule.status).toBe(201);
    scheduleId = createdSchedule.data.schedule.id;
  });

  afterAll(async () => {
    await cleanup(createdPlanIds);
  });

  it('moment 생성/목록 조회/수정/삭제', async () => {
    const created = await api<{ moment: { id: number; note: string; mood: string; revisit: string } }>(
      'POST',
      `/api/schedules/${scheduleId}/moments`,
      {
        note: '노을이 정말 예뻤다',
        mood: 'amazing',
        revisit: 'yes',
      },
      authHeaders(credential)
    );

    expect(created.status).toBe(201);
    expect(created.data.moment.id).toBeTypeOf('number');
    expect(created.data.moment.note).toBe('노을이 정말 예뻤다');
    expect(created.data.moment.mood).toBe('amazing');
    expect(created.data.moment.revisit).toBe('yes');

    const momentId = created.data.moment.id;

    const list = await api<{ moments: Array<{ id: number }> }>('GET', `/api/schedules/${scheduleId}/moments`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.data.moments)).toBe(true);
    expect(list.data.moments.some((m) => m.id === momentId)).toBe(true);

    const updated = await api<{ moment: { id: number; note: string; mood: string; revisit: string } }>(
      'PUT',
      `/api/moments/${momentId}`,
      {
        note: '다음엔 가족과 다시 오고 싶다',
        mood: 'good',
        revisit: 'maybe',
      },
      authHeaders(credential)
    );

    expect(updated.status).toBe(200);
    expect(updated.data.moment.id).toBe(momentId);
    expect(updated.data.moment.note).toBe('다음엔 가족과 다시 오고 싶다');
    expect(updated.data.moment.mood).toBe('good');
    expect(updated.data.moment.revisit).toBe('maybe');

    const deleted = await api<{ message: string }>(
      'DELETE',
      `/api/moments/${momentId}`,
      undefined,
      authHeaders(credential)
    );

    expect(deleted.status).toBe(200);

    const afterDelete = await api<{ moments: Array<{ id: number }> }>('GET', `/api/schedules/${scheduleId}/moments`);
    expect(afterDelete.status).toBe(200);
    expect(afterDelete.data.moments.some((m) => m.id === momentId)).toBe(false);
  });

  it('인증 없이 moment 생성 시 401', async () => {
    const res = await api('POST', `/api/schedules/${scheduleId}/moments`, {
      note: 'unauthorized attempt',
      mood: 'okay',
      revisit: 'no',
    });

    expect(res.status).toBe(401);
  });
});
