import { requirePlatformPermission } from "@/lib/rbac";
import { ApprovalQueue } from "@/components/partners/approval-queue";
export default async function Approvals({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePlatformPermission("vendor.read");
  return <ApprovalQueue searchParams={await searchParams} />;
}
