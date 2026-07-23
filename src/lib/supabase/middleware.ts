import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { CookieToSet } from "./cookies";

// Refreshes the Supabase auth session on every request and returns both the
// (possibly cookie-updated) response and the current user + profile so the
// middleware can gate routes. Keep this fast: a single getUser + one profile read.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let paywallUnlocked = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("paywall_unlocked")
      .eq("id", user.id)
      .maybeSingle();
    paywallUnlocked = !!profile?.paywall_unlocked;
  }

  return { response, user, paywallUnlocked };
}
