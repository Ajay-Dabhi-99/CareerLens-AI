import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ServerEnv } from '@career-lens-ai/config';

/**
 * Admin client — uses the service role key and bypasses row-level security.
 * Never expose this client or its key to the frontend. Use it only where the
 * route has already established which user is making the request.
 */
export function createSupabaseAdminClient(env: ServerEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
