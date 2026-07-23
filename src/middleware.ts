import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Routes reachable while authenticated but NOT yet paywall-unlocked.
const PAYWALL_ALLOWED_PREFIXES = ["/paywall"];

export async function middleware(request: NextRequest) {
  const { response, user, paywallUnlocked } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isApp =
    pathname.startsWith("/chat") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/stats") ||
    pathname.startsWith("/paywall");

  // Not signed in and hitting a gated app route → /login
  if (!user && isApp) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const onPaywallAllowed = PAYWALL_ALLOWED_PREFIXES.some((p) =>
      pathname.startsWith(p),
    );

    // Signed in but not unlocked → force to /paywall for every gated route.
    if (!paywallUnlocked && isApp && !onPaywallAllowed) {
      const url = request.nextUrl.clone();
      url.pathname = "/paywall";
      return NextResponse.redirect(url);
    }

    // Already unlocked but sitting on /paywall → send to /chat.
    if (paywallUnlocked && pathname.startsWith("/paywall")) {
      const url = request.nextUrl.clone();
      url.pathname = "/chat";
      return NextResponse.redirect(url);
    }

    // Signed in and unlocked, landing on /login → go to app.
    if (pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = paywallUnlocked ? "/chat" : "/paywall";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Run on app routes and /login, but skip static assets, images, and the
    // auth callback / webhook / api routes (those manage their own auth).
    "/chat/:path*",
    "/settings/:path*",
    "/stats/:path*",
    "/paywall/:path*",
    "/login",
  ],
};
