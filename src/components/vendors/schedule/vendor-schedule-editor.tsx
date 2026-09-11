"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { VendorSchedule } from "@/generated/prisma/client";
import { DAYS_OF_WEEK } from "@/lib/validations/vendor-schedule.schema";
import { usePermission } from "@/hooks/use-permission";
import { updateVendorSchedule } from "@/server/actions/vendor-schedule.actions";

function toHHMM(date: Date): string {
  return date.toISOString().slice(11, 16);
}

export function VendorScheduleEditor({
  vendorId,
  schedules,
}: {
  vendorId: string;
  schedules: VendorSchedule[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canEdit = usePermission("vendor.update");

  const [days, setDays] = useState(() =>
    DAYS_OF_WEEK.map((dayOfWeek) => {
      const existing = schedules.find((s) => s.dayOfWeek === dayOfWeek);
      return {
        dayOfWeek,
        isClosed: existing?.isClosed ?? false,
        openTime: existing ? toHHMM(existing.openTime) : "09:00",
        closeTime: existing ? toHHMM(existing.closeTime) : "18:00",
      };
    }),
  );

  function updateDay(index: number, patch: Partial<(typeof days)[number]>) {
    setDays((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await updateVendorSchedule(vendorId, { days });
        toast.success("Timings updated");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Update failed");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-2">
        {days.map((day, index) => (
          <div key={day.dayOfWeek} className="flex items-center gap-4">
            <span className="w-28 text-sm font-medium">
              {day.dayOfWeek[0] + day.dayOfWeek.slice(1).toLowerCase()}
            </span>
            <Input
              type="time"
              className="w-32"
              value={day.openTime}
              disabled={!canEdit || day.isClosed}
              onChange={(e) => updateDay(index, { openTime: e.target.value })}
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="time"
              className="w-32"
              value={day.closeTime}
              disabled={!canEdit || day.isClosed}
              onChange={(e) => updateDay(index, { closeTime: e.target.value })}
            />
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={day.isClosed}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  updateDay(index, { isClosed: checked === true })
                }
              />
              Closed
            </Label>
          </div>
        ))}
      </div>
      {canEdit && (
        <Button onClick={handleSave} disabled={isPending} aria-busy={isPending}>
          {isPending ? "Saving..." : "Save Timings"}
        </Button>
      )}
    </div>
  );
}
