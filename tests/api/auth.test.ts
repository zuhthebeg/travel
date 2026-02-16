import { describe, it, expect } from 'vitest';
import { api, createTestCredential } from './helpers';

describe('Auth API', () => {
  it('새 유저 로그인 → 유저 생성됨', async () => {
    const seed = `${Date.now()}_new`;
    const credential = createTestCredential(`test_${seed}`, `test_${seed}@example.com`, 'Test New User');

    const res = await api<{ user: { id: number; email: string; username: string } }>('POST', '/api/auth/google', {
      credential,
    });

    expect(res.status).toBe(200);
    expect(res.data.user.id).toBeTypeOf('number');
    expect(res.data.user.email).toContain(`test_${seed}`);
  });

  it('기존 유저 재로그인 → 동일 유저 반환', async () => {
    const seed = `${Date.now()}_existing`;
    const credential = createTestCredential(`test_${seed}`, `test_${seed}@example.com`, 'Test Existing User');

    const first = await api<{ user: { id: number } }>('POST', '/api/auth/google', { credential });
    const second = await api<{ user: { id: number } }>('POST', '/api/auth/google', { credential });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.data.user.id).toBe(first.data.user.id);
  });

  it('잘못된 credential → 에러', async () => {
    const res = await api<{ error?: string }>('POST', '/api/auth/google', {
      credential: 'not-a-valid-credential',
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.data.error || res.data.raw).toBeTruthy();
  });
});
