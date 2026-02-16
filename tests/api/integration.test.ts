import { describe, expect, it } from 'vitest';
import { api, cleanup, createTestCredential } from './helpers';

describe('Integration Flow', () => {
  it('로그인→플랜/스케줄/지오코딩/메모/수정/삭제 전체 플로우', async () => {
    const createdPlanIds: number[] = [];

    try {
      // 1) 로그인
      const seed = `${Date.now()}_integration`;
      const credential = createTestCredential(`test_${seed}`, `test_${seed}@example.com`, 'Integration User');
      const login = await api<{ user: { id: number } }>('POST', '/api/auth/google', { credential });
      expect(login.status).toBe(200);
      const userId = login.data.user.id;

      // 2) 플랜 생성 (도쿄 3박4일)
      const planRes = await api<{ plan: { id: number; title: string } }>('POST', '/api/plans', {
        user_id: userId,
        title: '도쿄 3박4일 테스트',
        region: '도쿄',
        start_date: '2026-04-10',
        end_date: '2026-04-13',
        is_public: false,
      });
      expect(planRes.status).toBe(201);
      const planId = planRes.data.plan.id;
      createdPlanIds.push(planId);

      // 3) 스케줄 4개 생성 (하루 1개)
      const dates = ['2026-04-10', '2026-04-11', '2026-04-12', '2026-04-13'];
      const places = ['Tokyo Tower', 'Shibuya Crossing', 'Senso-ji Temple', 'Ueno Park'];

      for (let i = 0; i < 4; i++) {
        const schedule = await api('POST', '/api/schedules', {
          plan_id: planId,
          date: dates[i],
          time: '10:00',
          title: `Day ${i + 1}`,
          place: places[i],
          place_en: places[i],
          order_index: i,
        });
        expect(schedule.status).toBe(201);
      }

      // 4) 지오코딩 실행
      const geocode = await api<{ success: boolean; updated: number }>('POST', `/api/plans/${planId}/geocode-schedules`, {
        mode: 'missing',
      });
      expect(geocode.status).toBe(200);
      expect(geocode.data.success).toBe(true);

      // 5) 스케줄 좌표 확인
      const list = await api<{ schedules: Array<{ latitude: number | null; longitude: number | null; id: number }> }>('GET', `/api/schedules?plan_id=${planId}`);
      expect(list.status).toBe(200);
      expect(list.data.schedules.length).toBe(4);
      const geocodedCount = list.data.schedules.filter((s) => s.latitude !== null && s.longitude !== null).length;
      expect(geocodedCount).toBeGreaterThanOrEqual(1);

      // 6) 메모 생성 (비자, 날씨)
      const memoVisa = await api('POST', `/api/plans/${planId}/memos`, {
        category: 'visa',
        title: '비자',
        content: '무비자 확인',
      });
      const memoWeather = await api('POST', `/api/plans/${planId}/memos`, {
        category: 'weather',
        title: '날씨',
        content: '봄 옷 준비',
      });
      expect(memoVisa.status).toBe(200);
      expect(memoWeather.status).toBe(200);

      // 7) 플랜 수정
      const planUpdate = await api<{ plan: { title: string } }>('PUT', `/api/plans/${planId}`, {
        title: '도쿄 3박4일 테스트(수정)',
      });
      expect(planUpdate.status).toBe(200);
      expect(planUpdate.data.plan.title).toContain('(수정)');

      // 8) 스케줄 수정
      const firstScheduleId = list.data.schedules[0].id;
      const scheduleUpdate = await api<{ schedule: { title: string } }>('PUT', `/api/schedules/${firstScheduleId}`, {
        title: 'Day 1 updated',
      });
      expect(scheduleUpdate.status).toBe(200);
      expect(scheduleUpdate.data.schedule.title).toBe('Day 1 updated');

      // 9) 전체 삭제 후 확인
      const planDelete = await api('DELETE', `/api/plans/${planId}`);
      expect(planDelete.status).toBe(200);

      const afterDelete = await api('GET', `/api/plans/${planId}`);
      expect(afterDelete.status).toBe(404);
    } finally {
      await cleanup(createdPlanIds);
    }
  });
});
