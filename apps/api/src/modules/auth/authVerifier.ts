import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email: string | null;
}

/**
 * Verifies a bearer token and resolves the user it belongs to.
 * Routes depend on this interface, not on Supabase directly, so auth can be
 * tested without live credentials and swapped without touching route code.
 */
export interface AuthVerifier {
  verifyToken(token: string): Promise<AuthUser | null>;
}

export function createSupabaseAuthVerifier(client: SupabaseClient): AuthVerifier {
  return {
    async verifyToken(token: string): Promise<AuthUser | null> {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) {
        return null;
      }
      return { id: data.user.id, email: data.user.email ?? null };
    },
  };
}
