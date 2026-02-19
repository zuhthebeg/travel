import { Env, User, jsonResponse, errorResponse } from '../../types';

// Handle CORS preflight requests
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Credential',
    },
  });
};

// POST /api/auth/guest - Guest login with nickname
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { nickname } = await context.request.json<{ nickname: string }>();

    if (!nickname || nickname.trim().length < 2 || nickname.trim().length > 20) {
      return errorResponse('닉네임은 2~20자로 입력해주세요.', 400);
    }

    const trimmed = nickname.trim();

    // Check if guest user exists with this username
    const existing = await context.env.DB.prepare(
      "SELECT * FROM users WHERE username = ? AND auth_provider = 'guest'"
    ).bind(trimmed).first<User>();

    let user: User;

    if (existing) {
      user = existing;
    } else {
      // Check username uniqueness (including google users)
      const taken = await context.env.DB.prepare(
        'SELECT id FROM users WHERE username = ?'
      ).bind(trimmed).first();

      if (taken) {
        return errorResponse('이미 사용 중인 닉네임입니다.', 409);
      }

      // Create guest user
      const { success } = await context.env.DB.prepare(
        "INSERT INTO users (username, password, auth_provider) VALUES (?, NULL, 'guest')"
      ).bind(trimmed).run();

      if (!success) {
        return errorResponse('계정 생성에 실패했습니다.', 500);
      }

      const created = await context.env.DB.prepare(
        "SELECT * FROM users WHERE username = ? AND auth_provider = 'guest'"
      ).bind(trimmed).first<User>();

      if (!created) {
        return errorResponse('계정 조회에 실패했습니다.', 500);
      }

      user = created;
    }

    // Create a simple credential token (base64 JSON)
    const credential = btoa(JSON.stringify({
      sub: `guest_${user.id}`,
      username: user.username,
      auth_provider: 'guest',
    }));

    return jsonResponse({
      user: {
        id: user.id,
        username: user.username,
        email: null,
        picture: null,
        auth_provider: 'guest',
      },
      credential,
    });
  } catch (error) {
    console.error('Guest login error:', error);
    return errorResponse('게스트 로그인에 실패했습니다.', 500);
  }
};
