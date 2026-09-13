import { z } from 'zod';

/**
 * Server-side environment schema (apps/api only).
 * Never import this from frontend code — it contains secret-bearing keys.
 */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  /**
   * Overridable because Google retires models on its own schedule — a pinned
   * default went end-of-life during development. Changing this is a config
   * change, not a deploy.
   */
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /**
   * Whether to believe X-Forwarded-For. Off locally, on behind a hosting proxy.
   *
   * It matters for more than logging: rate limits key on the client address, and
   * behind a proxy without this every visitor appears to come from the proxy —
   * so they all share one bucket, and one person's uploads lock everyone out.
   * It must stay off when there is no proxy, or a client could spoof its own
   * address and dodge the limits entirely.
   */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

/**
 * Client-side environment schema (apps/web only).
 * Only variables safe to ship to the browser belong here.
 */
export const clientEnvSchema = z.object({
  VITE_API_BASE_URL: z.string().url().default('http://localhost:5000'),
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
