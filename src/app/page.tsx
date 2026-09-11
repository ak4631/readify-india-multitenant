import { redirect } from "next/navigation";
import { getCurrentSession, hasPermission } from "@/lib/rbac";

export default async function RootPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login");
  redirect(
    hasPermission(session, "dashboard.read") ? "/dashboard" : "/vendors",
  );
}
