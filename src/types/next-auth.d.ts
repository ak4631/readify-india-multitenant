import type { PermissionKey } from "@/config/permissions";
import type { UserStatus } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      roles: string[];
      permissions: PermissionKey[];
    };
  }

  interface User {
    id: string;
    name: string;
    email: string;
    roles: string[];
    permissions: PermissionKey[];
    status: UserStatus;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    roles: string[];
    permissions: PermissionKey[];
  }
}
