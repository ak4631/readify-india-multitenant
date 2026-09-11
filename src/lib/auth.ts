import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import type { PermissionKey } from "@/config/permissions";

const STALE_AFTER_MS = 5 * 60 * 1000;

async function loadRolesAndPermissions(userId: string) {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  });

  const roles = userRoles.map((ur) => ur.role.name);
  const permissions = Array.from(
    new Set(
      userRoles.flatMap((ur) =>
        ur.role.permissions.map((rp) => rp.permission.key),
      ),
    ),
  ) as PermissionKey[];

  return { roles, permissions };
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { partner: { select: { status: true } } },
        });

        if (
          !user ||
          user.status !== "ACTIVE" ||
          (user.partnerId && user.partner?.status !== "ACTIVE")
        )
          return null;

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash,
        );
        if (!isValid) return null;

        const { roles, permissions } = await loadRolesAndPermissions(user.id);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          roles,
          permissions,
          status: user.status,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.roles = user.roles;
        token.permissions = user.permissions;
        return token;
      }

      const issuedAtMs = (typeof token.iat === "number" ? token.iat : 0) * 1000;
      if (Date.now() - issuedAtMs > STALE_AFTER_MS) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id },
          include: { partner: { select: { status: true } } },
        });
        if (
          !dbUser ||
          dbUser.status !== "ACTIVE" ||
          (dbUser.partnerId && dbUser.partner?.status !== "ACTIVE")
        ) {
          // Force sign-out: an empty/invalid token gets rejected by the session callback.
          return { ...token, id: "", roles: [], permissions: [] };
        }
        const { roles, permissions } = await loadRolesAndPermissions(dbUser.id);
        token.roles = roles;
        token.permissions = permissions;
      }

      return token;
    },
    async session({ session, token }) {
      if (!token.id) {
        // Signals an invalidated session (see jwt callback) — treat as logged out.
        return { ...session, user: undefined as never };
      }
      session.user.id = token.id;
      session.user.roles = token.roles;
      session.user.permissions = token.permissions;
      return session;
    },
  },
};
