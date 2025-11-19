import { Env, User, GoogleLoginRequest, jsonResponse, errorResponse } from '../../types';

// Handle CORS preflight requests
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

// POST /api/auth/google - Authenticate with Google ID token
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json<GoogleLoginRequest>();

    if (!body.credential) {
      return errorResponse('Google credential is required');
    }

    // Decode JWT to get user info (we trust Google's signature for MVP)
    // In production, you should verify the JWT signature with Google's public keys
    const payload = decodeJWT(body.credential);

    if (!payload || !payload.sub || !payload.email) {
      return errorResponse('Invalid Google credential');
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || email.split('@')[0];
    const picture = payload.picture || null;

    // Check if user exists with this Google ID
    const { results: existingUsers } = await context.env.DB.prepare(
      'SELECT * FROM users WHERE google_id = ?'
    )
      .bind(googleId)
      .all<User>();

    let user: User;

    if (existingUsers && existingUsers.length > 0) {
      // User exists, return it
      user = existingUsers[0];

      // Update profile picture if changed
      if (user.picture !== picture) {
        await context.env.DB.prepare(
          'UPDATE users SET picture = ?, email = ? WHERE id = ?'
        )
          .bind(picture, email, user.id)
          .run();

        user.picture = picture;
        user.email = email;
      }
    } else {
      // Create new user
      const { success } = await context.env.DB.prepare(
        'INSERT INTO users (username, password, google_id, email, picture, auth_provider) VALUES (?, NULL, ?, ?, ?, ?)'
      )
        .bind(name, googleId, email, picture, 'google')
        .run();

      if (!success) {
        return errorResponse('Failed to create user', 500);
      }

      // Fetch the newly created user
      const { results: newUsers } = await context.env.DB.prepare(
        'SELECT * FROM users WHERE google_id = ?'
      )
        .bind(googleId)
        .all<User>();

      if (!newUsers || newUsers.length === 0) {
        return errorResponse('Failed to retrieve created user', 500);
      }

      user = newUsers[0];
    }

    // Return user data (excluding password)
    return jsonResponse({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        picture: user.picture,
        auth_provider: user.auth_provider,
      },
    });
  } catch (error) {
    console.error('Google login error:', error);
    return errorResponse('Google login failed', 500);
  }
};

// Simple JWT decoder (no signature verification for MVP)
// In production, verify signature with Google's public keys
function decodeJWT(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch (error) {
    console.error('JWT decode error:', error);
    return null;
  }
}
