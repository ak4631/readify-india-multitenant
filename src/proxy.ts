import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { ROUTE_PERMISSIONS } from "@/config/permissions";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
