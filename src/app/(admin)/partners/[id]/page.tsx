import Link from "next/link";
import { requirePartnerAccess } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getWorkspaceSummary } from "@/server/actions/workspace.actions";
import { WorkspaceSummary } from "@/components/dashboard/workspace-summary";

export default async function PartnerOverview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePartnerAccess(id, "partner.read");
  const [summary, services] = await Promise.all([
    getWorkspaceSummary(id),
    prisma.vendor.findMany({
      where: { partnerId: id },
      select: { category: { select: { name: true } } },
      distinct: ["categoryId"],
    }),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Organization overview</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Services:{" "}
          {services.map((s) => s.category.name).join(", ") || "No listings yet"}
          . Open a module above to manage this organization.
        </p>
      </div>
      <WorkspaceSummary data={summary} />
      <Link
        href={`/partners/${id}/approvals`}
        className="text-primary underline"
      >
        Review this partner’s pending actions
      </Link>
    </div>
  );
}
