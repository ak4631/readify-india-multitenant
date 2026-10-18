import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { ROUTE_PERMISSIONS } from "@/config/permissions";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // These endpoints enforce customer JWTs, gateway signatures or job secrets
  // themselves. A browser staff-session redirect would break mobile checkout.
  if (
    pathname === "/api/registration" ||
    pathname.startsWith("/api/customer/") ||
    pathname.startsWith("/api/payments/") ||
    pathname.startsWith("/api/jobs/") ||
    pathname.startsWith("/checkout/")
  )
    return NextResponse.next();

  // Files in public/ must remain available before authentication (for example,
  // the Readify logo on the login screen).
  if (/\.[^/]+$/.test(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token || !token.id) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const requiredPermission = Object.entries(ROUTE_PERMISSIONS).find(([route]) =>
    pathname.startsWith(route),
  )?.[1];

  if (requiredPermission && !token.permissions?.includes(requiredPermission)) {
    return NextResponse.redirect(new URL("/403", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!login|register|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
