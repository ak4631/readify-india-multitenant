import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePartnerAccess, hasPermission } from "@/lib/rbac";
import { PARTNER_MODULES } from "@/config/partner-modules";
import { PageHeader } from "@/components/layout/page-header";
import { PartnerFormDialog } from "@/components/partners/partner-form-dialog";
import { Button } from "@/components/ui/button";
import { ApplicationReview } from "@/components/partners/application-review";

export default async function PartnerLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const session = await requirePartnerAccess(id, "partner.read");
  const partner = await prisma.partner.findUnique({ where: { id } });
  if (!partner) notFound();
  const modules = PARTNER_MODULES.filter((m) =>
    hasPermission(session, m.permission),
  );
  return (
    <div className="space-y-6 min-w-0">
      <Link href="/partners" className="text-sm text-primary underline">
        All partners
      </Link>
      <PageHeader
        eyebrow="Partner workspace"
        title={partner.name}
        description={`${partner.status} · Application ${partner.approvalStatus.toLowerCase()} · ${[partner.email, partner.phone].filter(Boolean).join(" · ")}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {hasPermission(session, "partner.update") && (
              <PartnerFormDialog
                partner={partner}
                trigger={<Button variant="outline">Edit partner</Button>}
              />
            )}{" "}
            {hasPermission(session, "vendor.create") && (
              <Link
                className="rounded-md border px-4 py-2 text-sm font-semibold"
                href={`/vendors/new?partnerId=${encodeURIComponent(id)}`}
              >
                Add listing
              </Link>
            )}
          </div>
        }
      />
      {partner.approvalStatus === "PENDING" &&
        session.user.roles.includes("SUPER_ADMIN") && (
          <ApplicationReview
            partnerId={id}
            version={partner.applicationVersion}
          />
        )}
      {partner.applicationReason && (
        <p className="rounded border p-3 text-sm">
          Application feedback: {partner.applicationReason}
        </p>
      )}
      <nav
        aria-label="Partner modules"
        className="flex flex-wrap gap-2 border-b pb-4"
      >
        {modules.map((m) => (
          <Link
            key={m.key}
            href={
              m.key === "overview"
                ? `/partners/${id}`
                : `/partners/${id}/${m.key}`
            }
            className="whitespace-nowrap rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
          >
            {m.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
