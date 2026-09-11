"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CourseDetailDialog } from "@/components/vendors/exam-hub/course-detail-dialog";
import { CourseFormDialog } from "@/components/vendors/exam-hub/course-form-dialog";
import type {
  Course,
  CourseTeacher,
  Lecture,
  Subject,
  Teacher,
} from "@/generated/prisma/client";
import { usePermission } from "@/hooks/use-permission";
import { archiveCourse } from "@/server/actions/courses.actions";

type CourseRow = Course & {
  subject: Subject | null;
  teachers: (CourseTeacher & { teacher: Teacher })[];
  lectures: Lecture[];
};

export function CoursesList({
  vendorId,
  courses,
  subjects,
  teachers,
}: {
  vendorId: string;
  courses: CourseRow[];
  subjects: Subject[];
  teachers: Teacher[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canEdit = usePermission("vendor.update");

  function handleArchive(courseId: string) {
    startTransition(async () => {
      try {
        await archiveCourse(courseId);
        toast.success("Course archived");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <CourseFormDialog
          vendorId={vendorId}
          subjects={subjects}
          trigger={<Button>+ Add Course</Button>}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {courses.map((course) => (
          <Card key={course.id}>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>{course.name}</CardTitle>
                <p className="text-muted-foreground text-sm">
                  {course.subject?.name ?? "No subject"} · {course.mode} · ₹
                  {Number(course.price).toLocaleString()}
                </p>
              </div>
              <Badge variant={course.status === "ACTIVE" ? "default" : "secondary"}>
                {course.status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {course.teachers.map((t) => (
                  <Badge key={t.teacherId} variant="outline">
                    {t.teacher.name}
                  </Badge>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                {course.lectures.length} lecture{course.lectures.length === 1 ? "" : "s"} scheduled
              </p>
              <div className="flex gap-2">
                {canEdit && (
                  <CourseFormDialog
                    vendorId={vendorId}
                    subjects={subjects}
                    course={course}
                    trigger={
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    }
                  />
                )}
                <CourseDetailDialog
                  vendorId={vendorId}
                  course={course}
                  allTeachers={teachers}
                  trigger={
                    <Button variant="outline" size="sm">
                      Manage
                    </Button>
                  }
                />
                {canEdit && course.status !== "ARCHIVED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleArchive(course.id)}
                  >
                    Archive
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {courses.length === 0 && (
          <p className="text-muted-foreground text-sm">No courses yet.</p>
        )}
      </div>
    </div>
  );
}
