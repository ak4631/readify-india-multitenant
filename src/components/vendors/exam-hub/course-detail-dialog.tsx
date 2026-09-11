"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Course, CourseTeacher, Lecture, Teacher } from "@/generated/prisma/client";
import { usePermission } from "@/hooks/use-permission";
import { cancelLecture, createLecture, setCourseTeachers } from "@/server/actions/courses.actions";

type CourseWithRelations = Course & {
  teachers: (CourseTeacher & { teacher: Teacher })[];
  lectures: Lecture[];
};

export function CourseDetailDialog({
  vendorId,
  course,
  allTeachers,
  trigger,
}: {
  vendorId: string;
  course: CourseWithRelations;
  allTeachers: Teacher[];
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canEdit = usePermission("vendor.update");

  const [selectedTeachers, setSelectedTeachers] = useState(
    new Set(course.teachers.map((t) => t.teacherId)),
  );

  const [lectureForm, setLectureForm] = useState({
    title: "",
    teacherId: "",
    mode: course.mode,
    startTime: "",
    endTime: "",
    meetingUrl: "",
  });

  function toggleTeacher(id: string) {
    setSelectedTeachers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function saveTeachers() {
    startTransition(async () => {
      try {
        await setCourseTeachers(course.id, Array.from(selectedTeachers));
        toast.success("Teachers updated");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Update failed");
      }
    });
  }

  function handleAddLecture() {
    startTransition(async () => {
      try {
        await createLecture(vendorId, course.id, {
          ...lectureForm,
          teacherId: lectureForm.teacherId || undefined,
        });
        toast.success("Lecture scheduled");
        setLectureForm({ title: "", teacherId: "", mode: course.mode, startTime: "", endTime: "", meetingUrl: "" });
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  function handleCancelLecture(lectureId: string) {
    startTransition(async () => {
      try {
        await cancelLecture(vendorId, lectureId);
        toast.success("Lecture cancelled");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{course.name}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="teachers">
          <TabsList>
            <TabsTrigger value="teachers">Teachers</TabsTrigger>
            <TabsTrigger value="lectures">Lectures</TabsTrigger>
          </TabsList>

          <TabsContent value="teachers" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {allTeachers.map((teacher) => (
                <Label key={teacher.id} className="flex items-center gap-2 font-normal">
                  <Checkbox
                    checked={selectedTeachers.has(teacher.id)}
                    onCheckedChange={() => toggleTeacher(teacher.id)}
                  />
                  {teacher.name}
                </Label>
              ))}
              {allTeachers.length === 0 && (
                <p className="text-muted-foreground col-span-2 text-sm">
                  Add teachers first, then assign them here.
                </p>
              )}
            </div>
            {canEdit && (
              <Button size="sm" onClick={saveTeachers} disabled={isPending}>
                Save Teachers
              </Button>
            )}
          </TabsContent>

          <TabsContent value="lectures" className="space-y-4">
            <div className="space-y-2">
              {course.lectures.map((lecture) => (
                <div
                  key={lecture.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{lecture.title}</p>
                    <p className="text-muted-foreground">
                      {new Date(lecture.startTime).toLocaleString()} · {lecture.mode}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={lecture.status === "CANCELLED" ? "destructive" : "default"}>
                      {lecture.status}
                    </Badge>
                    {canEdit && lecture.status !== "CANCELLED" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleCancelLecture(lecture.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {course.lectures.length === 0 && (
                <p className="text-muted-foreground text-sm">No lectures scheduled yet.</p>
              )}
            </div>
            {canEdit && (
              <div className="space-y-2 rounded-lg border p-3">
                <Input
                  placeholder="Lecture title"
                  value={lectureForm.title}
                  onChange={(e) => setLectureForm((f) => ({ ...f, title: e.target.value }))}
                />
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Label>Start</Label>
                    <Input
                      type="datetime-local"
                      value={lectureForm.startTime}
                      onChange={(e) => setLectureForm((f) => ({ ...f, startTime: e.target.value }))}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label>End</Label>
                    <Input
                      type="datetime-local"
                      value={lectureForm.endTime}
                      onChange={(e) => setLectureForm((f) => ({ ...f, endTime: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Select
                    value={lectureForm.teacherId}
                    onValueChange={(v) => setLectureForm((f) => ({ ...f, teacherId: v ?? "" }))}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Teacher (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {allTeachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={lectureForm.mode}
                    onValueChange={(v) =>
                      setLectureForm((f) => ({ ...f, mode: v as typeof f.mode }))
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OFFLINE">Offline</SelectItem>
                      <SelectItem value="ONLINE">Online</SelectItem>
                      <SelectItem value="HYBRID">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {lectureForm.mode !== "OFFLINE" && (
                  <Input
                    placeholder="Meeting URL (admin-only, never shown publicly)"
                    value={lectureForm.meetingUrl}
                    onChange={(e) => setLectureForm((f) => ({ ...f, meetingUrl: e.target.value }))}
                  />
                )}
                <Button
                  size="sm"
                  onClick={handleAddLecture}
                  disabled={isPending || !lectureForm.title || !lectureForm.startTime || !lectureForm.endTime}
                >
                  Schedule Lecture
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
