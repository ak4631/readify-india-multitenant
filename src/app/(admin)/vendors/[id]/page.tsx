import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReviewTable } from "@/components/reviews/review-table";
import { AcademicsPanel } from "@/components/vendors/exam-hub/academics-panel";
import { VendorFacilitiesEditor } from "@/components/vendors/facilities/vendor-facilities-editor";
import { TrainersList } from "@/components/vendors/gym/trainers-list";
import { BookingTable } from "@/components/vendors/bookings/booking-table";
import { LibraryOccupancyPanel } from "@/components/vendors/library/occupancy-panel";
import { SeatConfiguration } from "@/components/vendors/library/seat-configuration";
import { VendorMediaGallery } from "@/components/vendors/media/vendor-media-gallery";
import { PlanList } from "@/components/vendors/plans/plan-list";
import { SubscriptionTable } from "@/components/subscriptions/subscription-table";
import { VendorScheduleEditor } from "@/components/vendors/schedule/vendor-schedule-editor";
import { MenuEditor } from "@/components/vendors/study-cafe/menu-editor";
import { VendorAddressEditDialog } from "@/components/vendors/vendor-address-edit-dialog";
import { DocumentList } from "@/components/vendors/verification/document-list";
import { UploadForm } from "@/components/vendors/verification/upload-form";
import { VendorLifecycleActions } from "@/components/vendors/vendor-lifecycle-actions";
import { VendorProfileEditDialog } from "@/components/vendors/vendor-profile-edit-dialog";
import { VendorAccountDialog } from "@/components/vendors/vendor-account-dialog";
import {
  VendorStatusBadge,
  VerificationStatusBadge,
} from "@/components/vendors/vendor-status-badge";
import { getRequiredDocuments } from "@/config/verification-requirements";
import { prisma } from "@/lib/prisma";
import { listCourses, listSubjects } from "@/server/actions/courses.actions";
import { listFacilities } from "@/server/actions/facilities.actions";
import { listVendorBookings } from "@/server/actions/bookings.actions";
import { getLibraryOccupancy } from "@/server/actions/library-occupancy.actions";
import { listLibrarySeatTypes } from "@/server/actions/library-seat-types.actions";
import { listMembershipPlans } from "@/server/actions/membership-plans.actions";
import { listMenu } from "@/server/actions/menu.actions";
import { listReviews } from "@/server/actions/reviews.actions";
import { listSubscriptions } from "@/server/actions/subscriptions.actions";
import { listTeachers } from "@/server/actions/teachers.actions";
import {
  listTrainerSpecializations,
  listTrainers,
} from "@/server/actions/trainers.actions";
import { listVendorCategories } from "@/server/actions/vendor-categories.actions";
import { getVendorSchedule } from "@/server/actions/vendor-schedule.actions";
import { getVendorById } from "@/server/actions/vendors.actions";
import { getCurrentSession, hasPermission } from "@/lib/rbac";

const CATEGORY_TAB_LABEL: Record<string, string> = {
  library: "Seats",
  gym: "Trainers",
  "study-cafe": "Menu",
  "exam-hub": "Academics",
};

export default async function VendorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; date?: string }>;
}) {
  const { id } = await params;
  const { tab, date } = await searchParams;
  const vendor = await getVendorById(id);
  const session = await getCurrentSession();

  if (!vendor) notFound();

  const categorySlug = vendor.category.slug;
  const canViewReviews = hasPermission(session, "review.read");
  const canViewSubscriptions = hasPermission(session, "subscription.read");

  const [
    categories,
    facilities,
    vendorFacilities,
    plans,
    schedules,
    media,
    reviews,
    subscriptions,
    bookings,
  ] = await Promise.all([
    listVendorCategories(),
    listFacilities(),
    prisma.vendorFacility.findMany({ where: { vendorId: id } }),
    listMembershipPlans(id),
    getVendorSchedule(id),
    prisma.vendorMedia.findMany({
      where: { vendorId: id },
      orderBy: { sortOrder: "asc" },
    }),
    canViewReviews ? listReviews({ vendorId: id }) : Promise.resolve([]),
    canViewSubscriptions
      ? listSubscriptions({ vendorId: id })
      : Promise.resolve([]),
    listVendorBookings(id),
  ]);

  const categoryTabLabel = CATEGORY_TAB_LABEL[categorySlug];

  // Library occupancy is computed for a day in the vendor's own timezone.
  let occupancy: Awaited<ReturnType<typeof getLibraryOccupancy>> | null = null;
  if (categorySlug === "library") {
    const selectedDate =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : new Date().toLocaleDateString("en-CA", { timeZone: vendor.timeZone });
    occupancy = await getLibraryOccupancy(id, selectedDate);
  }

  return (
    <div className="space-y-8">
      <Link
        href="/vendors"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to partner listings
      </Link>
      <PageHeader
        eyebrow={vendor.category.name}
        title={vendor.name}
        description={
          vendor.description ??
          "Partner listing profile, facilities, plans, schedule, and verification."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <VendorStatusBadge status={vendor.status} />
            <VerificationStatusBadge status={vendor.verificationStatus} />
            <VendorLifecycleActions
              vendorId={vendor.id}
              status={vendor.status}
            />
          </div>
        }
      />

      <Tabs defaultValue={tab ?? "overview"} className="gap-6">
        <TabsList className="h-auto w-full flex-wrap justify-start rounded-xl bg-card p-1 shadow-sm">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="facilities">Facilities</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          {occupancy && <TabsTrigger value="occupancy">Occupancy</TabsTrigger>}
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
          {canViewReviews && <TabsTrigger value="reviews">Reviews</TabsTrigger>}
          {canViewSubscriptions && (
            <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          )}
          <TabsTrigger value="verification">Verification</TabsTrigger>
          {categoryTabLabel && (
            <TabsTrigger value="category">{categoryTabLabel}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-muted/50 px-4 py-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Phone
                </p>
                <p className="mt-1 font-medium">{vendor.phone}</p>
              </div>
              <div className="rounded-xl bg-muted/50 px-4 py-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Email
                </p>
                <p className="mt-1 font-medium">{vendor.email ?? "—"}</p>
              </div>
              <div className="rounded-xl bg-muted/50 px-4 py-3 sm:col-span-2">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Address
                </p>
                <p className="mt-1 font-medium">
                  {vendor.address
                    ? `${vendor.address.addressLine1}, ${vendor.address.city}, ${vendor.address.state} ${vendor.address.pincode}`
                    : "Not set"}
                </p>
              </div>
              <div className="rounded-xl bg-muted/50 px-4 py-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Created by
                </p>
                <p className="mt-1 font-medium">{vendor.createdBy.name}</p>
              </div>
              {vendor.rejectionReason && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 sm:col-span-2">
                  <p className="text-xs font-semibold tracking-wide text-destructive uppercase">
                    Rejection reason
                  </p>
                  <p className="mt-1 font-medium">{vendor.rejectionReason}</p>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <VendorProfileEditDialog vendor={vendor} categories={categories} />
            <VendorAddressEditDialog
              vendorId={vendor.id}
              address={vendor.address}
            />
            {hasPermission(session, "vendorAccount.create") && (
              <VendorAccountDialog vendorId={vendor.id} />
            )}
          </div>
          {hasPermission(session, "vendorAccount.create") &&
            vendor.partner.users.length > 0 && (
              <Card>
                <CardContent>
                  <p className="mb-3 text-sm font-semibold">Partner accounts</p>
                  <div className="space-y-2">
                    {vendor.partner.users.map((partnerUser) => (
                      <div
                        key={partnerUser.id}
                        className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm"
                      >
                        <span className="font-medium">{partnerUser.name}</span>
                        <span className="text-muted-foreground">
                          {partnerUser.email}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
        </TabsContent>

        <TabsContent value="facilities">
          <VendorFacilitiesEditor
            vendorId={vendor.id}
            allFacilities={facilities.filter((f) => f.status === "ACTIVE")}
            selectedFacilityIds={vendorFacilities.map((f) => f.facilityId)}
          />
        </TabsContent>

        <TabsContent value="plans">
          <PlanList vendorId={vendor.id} plans={plans} />
        </TabsContent>

        <TabsContent value="schedule">
          <VendorScheduleEditor vendorId={vendor.id} schedules={schedules} />
        </TabsContent>

        {occupancy && (
          <TabsContent value="occupancy">
            <LibraryOccupancyPanel data={occupancy} />
          </TabsContent>
        )}

        <TabsContent value="bookings">
          <BookingTable bookings={bookings} />
        </TabsContent>

        <TabsContent value="photos">
          <VendorMediaGallery vendorId={vendor.id} media={media} />
        </TabsContent>

        {canViewReviews && (
          <TabsContent value="reviews">
            <ReviewTable reviews={reviews} />
          </TabsContent>
        )}

        {canViewSubscriptions && (
          <TabsContent value="subscriptions">
            <SubscriptionTable subscriptions={subscriptions} showCustomer />
          </TabsContent>
        )}

        <TabsContent value="verification" className="space-y-6">
          <UploadForm
            vendorId={vendor.id}
            requiredDocuments={getRequiredDocuments(vendor.category.slug)}
          />
          <DocumentList verifications={vendor.verifications} />
        </TabsContent>

        {categorySlug === "library" && (
          <TabsContent value="category">
            <LibraryCategoryPanel vendorId={vendor.id} />
          </TabsContent>
        )}
        {categorySlug === "gym" && (
          <TabsContent value="category">
            <GymCategoryPanel vendorId={vendor.id} />
          </TabsContent>
        )}
        {categorySlug === "study-cafe" && (
          <TabsContent value="category">
            <StudyCafeCategoryPanel vendorId={vendor.id} />
          </TabsContent>
        )}
        {categorySlug === "exam-hub" && (
          <TabsContent value="category">
            <ExamHubCategoryPanel vendorId={vendor.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

async function LibraryCategoryPanel({ vendorId }: { vendorId: string }) {
  const seatTypes = await listLibrarySeatTypes(vendorId);
  return <SeatConfiguration vendorId={vendorId} seatTypes={seatTypes} />;
}

async function GymCategoryPanel({ vendorId }: { vendorId: string }) {
  const [trainers, specializations] = await Promise.all([
    listTrainers(vendorId),
    listTrainerSpecializations(),
  ]);
  return (
    <TrainersList
      vendorId={vendorId}
      trainers={trainers}
      allSpecializations={specializations}
    />
  );
}

async function StudyCafeCategoryPanel({ vendorId }: { vendorId: string }) {
  const categories = await listMenu(vendorId);
  return <MenuEditor vendorId={vendorId} categories={categories} />;
}

async function ExamHubCategoryPanel({ vendorId }: { vendorId: string }) {
  const [teachers, courses, subjects] = await Promise.all([
    listTeachers(vendorId),
    listCourses(vendorId),
    listSubjects(),
  ]);
  return (
    <AcademicsPanel
      vendorId={vendorId}
      teachers={teachers}
      courses={courses}
      subjects={subjects}
    />
  );
}
