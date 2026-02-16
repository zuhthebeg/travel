import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, authHeaders, cleanup, createTestPlan, loginTestUser } from './helpers';

describe('Plan Members API', () => {
  const createdPlanIds: number[] = [];

  let planId = 0;
  let ownerCredential = '';
  let memberCredential = '';
  let memberUserId = 0;
  let memberEmail = '';

  beforeAll(async () => {
    const owner = await loginTestUser(`${Date.now()}_members_owner`);
    ownerCredential = owner.credential;

    const member = await loginTestUser(`${Date.now()}_members_member`);
    memberCredential = member.credential;
    memberUserId = member.user.id;
    memberEmail = member.email;

    const plan = await createTestPlan(owner.user.id, `test_members_${Date.now()}`);
    planId = plan.id;
    createdPlanIds.push(planId);
  });

  afterAll(async () => {
    await cleanup(createdPlanIds);
  });

  it('멤버 초대 (이메일)', async () => {
    const invited = await api<{ member: { user_id: number; email: string; role: string } }>(
      'POST',
      `/api/plans/${planId}/members`,
      { email: memberEmail },
      authHeaders(ownerCredential)
    );

    expect(invited.status).toBe(201);
    expect(invited.data.member.user_id).toBe(memberUserId);
    expect(invited.data.member.email).toBe(memberEmail);
    expect(invited.data.member.role).toBe('member');
  });

  it('멤버 목록 조회', async () => {
    const list = await api<{ owner: { id: number }; members: Array<{ user_id: number }> }>('GET', `/api/plans/${planId}/members`);

    expect(list.status).toBe(200);
    expect(Array.isArray(list.data.members)).toBe(true);
    expect(list.data.members.some((m) => m.user_id === memberUserId)).toBe(true);
  });

  it('존재하지 않는 이메일 초대 시 404', async () => {
    const res = await api(
      'POST',
      `/api/plans/${planId}/members`,
      { email: `not-exists-${Date.now()}@example.com` },
      authHeaders(ownerCredential)
    );

    expect(res.status).toBe(404);
  });

  it('owner 아닌 사람이 초대 시 403', async () => {
    const res = await api(
      'POST',
      `/api/plans/${planId}/members`,
      { email: `another-${Date.now()}@example.com` },
      authHeaders(memberCredential)
    );

    expect(res.status).toBe(403);
  });

  it('멤버 제거', async () => {
    const removed = await api<{ message: string }>(
      'DELETE',
      `/api/plans/${planId}/members/${memberUserId}`,
      undefined,
      authHeaders(ownerCredential)
    );

    expect(removed.status).toBe(200);

    const listAfter = await api<{ members: Array<{ user_id: number }> }>('GET', `/api/plans/${planId}/members`);
    expect(listAfter.status).toBe(200);
    expect(listAfter.data.members.some((m) => m.user_id === memberUserId)).toBe(false);
  });
});
