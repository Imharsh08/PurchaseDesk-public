import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, decrypt } from "@/lib/session-token";

// Optimistic check only: pages and actions re-verify the user against the database.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // Google sign-in start and callback run before a session exists.
  if (pathname.startsWith("/api/auth/")) return NextResponse.next();

  const session = await decrypt(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    return session ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
