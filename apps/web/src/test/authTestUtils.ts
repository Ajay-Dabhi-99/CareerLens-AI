import type { Session } from '@supabase/supabase-js';

/** Minimal session shape the AuthProvider actually reads. */
export function fakeSession(email = 'jane@example.com', id = 'user-1'): Session {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id,
      email,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    },
  } as unknown as Session;
}
