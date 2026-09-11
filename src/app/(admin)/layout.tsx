import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/rbac";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();

  if (!session?.user) {
    redirect("/login");
  }

  const isPartnerAccount = session.user.roles.some((role) =>
    ["PARTNER_ADMIN", "PARTNER_EMPLOYEE"].includes(role),
  );
  const account = isPartnerAccount
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { partner: { select: { name: true } } },
      })
    : null;

  return (
    <div className="flex min-h-svh bg-background">
      <Sidebar
        permissions={session.user.permissions}
        roles={session.user.roles}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          name={session.user.name}
          email={session.user.email}
          permissions={session.user.permissions}
          roles={session.user.roles}
          organizationName={account?.partner?.name}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 md:px-8 lg:px-10">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
