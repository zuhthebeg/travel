export const BASE_URL = process.env.TEST_API_URL || 'https://travel-mvp.pages.dev';

export type ApiResult<T = any> = {
  status: number;
  ok: boolean;
  data: T;
};

export async function api<T = any>(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<ApiResult<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return { status: res.status, ok: res.ok, data };
}

function toBase64Url(obj: unknown) {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function createTestCredential(sub: string, email: string, name: string) {
  const header = { alg: 'none', typ: 'JWT' };
  const payload = {
    sub,
    email,
    name,
    picture: 'https://example.com/test-user.png',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  return `${toBase64Url(header)}.${toBase64Url(payload)}.test_signature`;
}

export async function loginTestUser(seed: string = Date.now().toString()) {
  const sub = `test_${seed}`;
  const email = `test_${seed}@example.com`;
  const name = `test_user_${seed}`;
  const credential = createTestCredential(sub, email, name);

  const res = await api<{ user: { id: number; email: string; username: string } }>('POST', '/api/auth/google', {
    credential,
  });

  if (!res.ok || !res.data?.user?.id) {
    throw new Error(`Failed to login test user: ${JSON.stringify(res.data)}`);
  }

  return {
    user: res.data.user,
    credential,
    sub,
    email,
    name,
  };
}

export async function createTestPlan(userId: number, title = `test_plan_${Date.now()}`) {
  const res = await api<{ plan: { id: number } }>('POST', '/api/plans', {
    user_id: userId,
    title,
    region: 'Tokyo',
    start_date: '2026-03-10',
    end_date: '2026-03-13',
    is_public: false,
  });

  if (!res.ok || !res.data?.plan?.id) {
    throw new Error(`Failed to create test plan: ${JSON.stringify(res.data)}`);
  }

  return res.data.plan;
}

export async function cleanup(planIds: number[]) {
  for (const id of [...new Set(planIds)].filter(Boolean)) {
    await api('DELETE', `/api/plans/${id}`);
  }
}
