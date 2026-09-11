import { CoursesList } from "@/components/vendors/exam-hub/courses-list";
import { TeachersList } from "@/components/vendors/exam-hub/teachers-list";
import type {
  Course,
  CourseTeacher,
  Lecture,
  Subject,
  Teacher,
} from "@/generated/prisma/client";

type CourseRow = Course & {
  subject: Subject | null;
  teachers: (CourseTeacher & { teacher: Teacher })[];
  lectures: Lecture[];
};

export function AcademicsPanel({
  vendorId,
  teachers,
  courses,
  subjects,
}: {
  vendorId: string;
  teachers: Teacher[];
  courses: CourseRow[];
  subjects: Subject[];
}) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Teachers</h3>
        <TeachersList vendorId={vendorId} teachers={teachers} />
      </section>
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Courses</h3>
        <CoursesList vendorId={vendorId} courses={courses} subjects={subjects} teachers={teachers} />
      </section>
    </div>
  );
}
