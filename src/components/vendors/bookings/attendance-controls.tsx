"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  checkInByCode,
  checkOutVisit,
} from "@/server/actions/attendance.actions";
import { usePermission } from "@/hooks/use-permission";
import type { listWorkspaceAttendance } from "@/server/actions/workspace.actions";

export function AttendanceControls({
  visits,
}: {
  visits: Awaited<ReturnType<typeof listWorkspaceAttendance>>;
}) {
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const canEdit = usePermission("vendor.update");
  function run(action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action();
        setCode("");
        toast.success("Attendance updated");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Attendance update failed",
        );
      }
    });
  }
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">Check-in / check-out</h2>
      <p className="text-sm text-muted-foreground">
        Scan with a keyboard scanner or enter the customer booking code. Only
        verified purchases within their reserved time can check in. A no-show is
        not automatically cancelled.
      </p>
      {canEdit && (
        <form
          className="flex gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => checkInByCode(code));
          }}
        >
          <Input
            aria-label="Booking or subscription QR code"
            placeholder="Booking / QR code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <Button disabled={pending || !code.trim()}>Check in</Button>
        </form>
      )}
      <p className="text-sm font-medium">Checked in now: {visits.length}</p>
      {visits.map((visit) => (
        <div
          key={visit.id}
          className="flex items-center justify-between gap-3 border-t py-3 text-sm"
        >
          <span>
            Visit {visit.targetId.slice(-8)} · admitted{" "}
            {new Date(visit.checkedInAt).toLocaleTimeString("en-IN")}
          </span>
          {canEdit && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => checkOutVisit(visit.id))}
            >
              Check out
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
