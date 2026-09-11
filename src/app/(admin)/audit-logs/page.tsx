import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAuditLogs } from "@/server/actions/audit-logs.actions";

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string }>;
}) {
  const { entityType } = await searchParams;
  const logs = await listAuditLogs({ entityType });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Security"
        title="Audit logs"
        description={`Most recent ${logs.length} admin actions.`}
      />
      <Card>
        <CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Entity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="whitespace-nowrap">
                {log.createdAt.toLocaleString()}
              </TableCell>
              <TableCell>{log.user?.name ?? "—"}</TableCell>
              <TableCell>{log.action}</TableCell>
              <TableCell>
                {log.entityType}
                {log.entityId ? ` #${log.entityId.slice(0, 8)}` : ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
        </CardContent>
      </Card>
    </div>
  );
}
