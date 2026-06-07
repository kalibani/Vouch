/**
 * Supabase client — SERVER ONLY.
 *
 * This module reads the SERVICE-ROLE key, which BYPASSES Row-Level Security.
 * NEVER import it from a client component or ship it to the browser. The
 * `/api/handover` route runs on the Node runtime; that is the only place this
 * client should be reached.
 *
 * The client is created lazily (on first `getDb()` call) so that merely
 * importing this module — e.g. during a build that doesn't hit the route —
 * doesn't require the env to be present.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// Validate env at the trust boundary: fail loudly with a clear message rather
// than letting an undefined URL/key surface as an opaque runtime error.
const DbEnvSchema = z.object({
  SUPABASE_URL: z.string().min(1, "SUPABASE_URL is required").url("SUPABASE_URL must be a URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
});

let cached: SupabaseClient | null = null;

/**
 * Lazily create (and memoize) the server-side Supabase client.
 * Throws if the required env vars are missing or malformed.
 */
export function getDb(): SupabaseClient {
  if (cached) return cached;

  const parsed = DbEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Supabase env misconfigured: ${issues}`);
  }

  cached = createClient(parsed.data.SUPABASE_URL, parsed.data.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      // Server-side: no browser session to persist or refresh.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}
