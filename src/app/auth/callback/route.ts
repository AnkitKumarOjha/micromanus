import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { serverEnv } from "@/lib/env";
import type { CookieToSet } from "@/lib/supabase/cookies";

// OAuth callback. Supabase redirects here with a `code`; we exchange it for a
// session (setting the auth cookies), then send the user into the app. The
// middleware then routes unpaid users to /paywall.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorDescription = searchParams.get("error_description");

  const baseUrl = serverEnv.siteUrl || origin;

  if (errorDescription) {
    return NextResponse.redirect(
      `${baseUrl}/login?error=${encodeURIComponent(errorDescription)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const response = NextResponse.redirect(`${baseUrl}/paywall`);

  const supabase = createServerClient(
    serverEnv.supabaseUrl,
    serverEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return response;
}
