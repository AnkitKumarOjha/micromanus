"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client (anon key, respects RLS). Used in client components
// for auth (signInWithOAuth / signOut) and reads that RLS allows.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
