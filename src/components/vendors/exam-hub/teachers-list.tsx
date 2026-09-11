"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeacherFormDialog } from "@/components/vendors/exam-hub/teacher-form-dialog";
import type { Teacher } from "@/generated/prisma/client";
import { usePermission } from "@/hooks/use-permission";
import { deactivateTeacher } from "@/server/actions/teachers.actions";

export function TeachersList({
  vendorId,
  teachers,
}: {
  vendorId: string;
  teachers: Teacher[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canEdit = usePermission("vendor.update");

  function handleDeactivate(teacherId: string) {
    startTransition(async () => {
      try {
        await deactivateTeacher(teacherId);
        toast.success("Teacher deactivated");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <TeacherFormDialog
          vendorId={vendorId}
          trigger={<Button>+ Add Teacher</Button>}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teachers.map((teacher) => (
          <Card key={teacher.id}>
            <CardHeader className="flex flex-row items-start justify-between">
              <CardTitle>{teacher.name}</CardTitle>
              <Badge
                variant={teacher.status === "ACTIVE" ? "default" : "secondary"}
              >
                {teacher.status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {teacher.experienceYears != null && (
                <p className="text-muted-foreground text-sm">
                  {teacher.experienceYears} yrs experience
                </p>
              )}
              {teacher.bio && (
                <p className="text-sm text-muted-foreground">{teacher.bio}</p>
              )}
              {canEdit && (
                <div className="flex gap-2">
                  <TeacherFormDialog
                    vendorId={vendorId}
                    teacher={teacher}
                    trigger={
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    }
                  />
                  {teacher.status === "ACTIVE" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      aria-busy={isPending}
                      onClick={() => handleDeactivate(teacher.id)}
                    >
                      Deactivate
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {teachers.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No teachers added yet.
          </p>
        )}
      </div>
    </div>
  );
}
