import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

// Idempotently ensure a profiles row exists for a signed-in user. The DB
// trigger normally creates it on signup, but if a user authenticated before
// the trigger existed (or it's disabled), this guarantees downstream reads
// (.single()) never 500. ON CONFLICT DO NOTHING preserves any existing
// credits / paywall state — never overwrites.
export async function ensureProfile(
  service: SupabaseClient,
  user: User,
): Promise<void> {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  await service.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      full_name:
        (meta.full_name as string | undefined) ??
        (meta.name as string | undefined) ??
        null,
      avatar_url: (meta.avatar_url as string | undefined) ?? null,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
}
