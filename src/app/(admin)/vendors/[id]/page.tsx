import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSession, hasPermission } from "@/lib/rbac";
import { proposalLabels, overlayRows } from "@/lib/listing-editor";
import { SETUP_STEPS } from "@/lib/listing-readiness";
import {
  getVendorById,
  getListingReadiness,
} from "@/server/actions/vendors.actions";
import {
  listListingChanges,
  listListingRevisions,
} from "@/server/actions/listing-changes.actions";
import { PageHeader } from "@/components/layout/page-header";
import { VendorLifecycleActions } from "@/components/vendors/vendor-lifecycle-actions";
import { VendorStatusBadge } from "@/components/vendors/vendor-status-badge";
import { VendorProfileEditDialog } from "@/components/vendors/vendor-profile-edit-dialog";
import { VendorAddressEditDialog } from "@/components/vendors/vendor-address-edit-dialog";
import { VendorCapacityCard } from "@/components/vendors/vendor-capacity-card";
import { VendorAccountDialog } from "@/components/vendors/vendor-account-dialog";
import { VendorFacilitiesEditor } from "@/components/vendors/facilities/vendor-facilities-editor";
import { PlanList } from "@/components/vendors/plans/plan-list";
import { VendorScheduleEditor } from "@/components/vendors/schedule/vendor-schedule-editor";
import { VendorMediaGallery } from "@/components/vendors/media/vendor-media-gallery";
import { ListingChangeList } from "@/components/vendors/listing-change-list";
import { SetupReview } from "@/components/vendors/setup-review";
import { UploadForm } from "@/components/vendors/verification/upload-form";
import { DocumentList } from "@/components/vendors/verification/document-list";
import { getRequiredDocuments } from "@/config/verification-requirements";
import { listVendorCategories } from "@/server/actions/vendor-categories.actions";
import { listFacilities } from "@/server/actions/facilities.actions";
import { listMembershipPlans } from "@/server/actions/membership-plans.actions";
import { getVendorSchedule } from "@/server/actions/vendor-schedule.actions";
import { listLibrarySeatTypes } from "@/server/actions/library-seat-types.actions";
import { getLibraryOccupancy } from "@/server/actions/library-occupancy.actions";
import { listVendorBookings } from "@/server/actions/bookings.actions";
import { listSubscriptions } from "@/server/actions/subscriptions.actions";
import { listReviews } from "@/server/actions/reviews.actions";
import {
  listTrainers,
  listTrainerSpecializations,
} from "@/server/actions/trainers.actions";
import { listTeachers } from "@/server/actions/teachers.actions";
import { listCourses, listSubjects } from "@/server/actions/courses.actions";
import { listMenu } from "@/server/actions/menu.actions";
import { SeatConfiguration } from "@/components/vendors/library/seat-configuration";
import { LibraryOccupancyPanel } from "@/components/vendors/library/occupancy-panel";
import { BookingTable } from "@/components/vendors/bookings/booking-table";
import { SubscriptionTable } from "@/components/subscriptions/subscription-table";
import { ReviewTable } from "@/components/reviews/review-table";
import { TrainersList } from "@/components/vendors/gym/trainers-list";
import { AcademicsPanel } from "@/components/vendors/exam-hub/academics-panel";
import { MenuEditor } from "@/components/vendors/co-working-space/menu-editor";

export default async function VendorDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; date?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const vendor = await getVendorById(id);
  if (!vendor) notFound();
  const session = await getCurrentSession();
  const tabs: [string, string][] = [
    ...SETUP_STEPS.map(([k, v]) => [k, v] as [string, string]),
    ["changes", "Changes"],
    ["bookings", "Bookings"],
  ];
  if (vendor.category.slug === "library") tabs.push(["occupancy", "Occupancy"]);
  if (hasPermission(session, "subscription.read"))
    tabs.push(["subscriptions", "Subscriptions"]);
  if (hasPermission(session, "review.read")) tabs.push(["reviews", "Reviews"]);
  const tab = tabs.some(([key]) => key === query.tab) ? query.tab! : "overview";
  const editable =
    hasPermission(session, "vendor.update") &&
    !["SUBMITTED", "UNDER_REVIEW"].includes(vendor.status);
  const changes = await listListingChanges(id);
  const frozen = changes.some((c) => c.status === "PENDING");
  let content: React.ReactNode;
  switch (tab) {
    case "overview":
      content = (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Basic listing details</h2>
          <p>{vendor.description ?? "Add a description of your space."}</p>
          <p className="text-sm">
            {vendor.phone} · {vendor.email ?? "No email"} ·{" "}
            {vendor.category.name}
          </p>
          {editable && !frozen && (
            <VendorProfileEditDialog
              key={vendor.id + vendor.contentVersion}
              vendor={vendor}
              categories={await listVendorCategories()}
            />
          )}{" "}
          {hasPermission(session, "vendorAccount.create") && (
            <VendorAccountDialog vendorId={id} />
          )}
        </div>
      );
      break;
    case "address":
      content = (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Contact and location</h2>
          <p>
            {vendor.address
              ? [
                  vendor.address.addressLine1,
                  vendor.address.city,
                  vendor.address.state,
                  vendor.address.pincode,
                ]
                  .filter(Boolean)
                  .join(", ")
              : "No address saved yet."}
          </p>
          {editable && !frozen && (
            <VendorAddressEditDialog vendorId={id} address={vendor.address} />
          )}
        </div>
      );
      break;
    case "verification":
      content = (
        <div className="space-y-5">
          {editable &&
            !frozen &&
            hasPermission(session, "verification.upload") && (
              <UploadForm
                vendorId={id}
                requiredDocuments={getRequiredDocuments(vendor.category.slug)}
              />
            )}
          <DocumentList
            verifications={vendor.verifications}
            requiredDocuments={getRequiredDocuments(vendor.category.slug)}
          />
        </div>
      );
      break;
    case "facilities": {
      const [facilities, selected] = await Promise.all([
        listFacilities(),
        prisma.vendorFacility.findMany({ where: { vendorId: id } }),
      ]);
      const proposal = changes.find(
        (c) =>
          c.kind === "FACILITIES" && ["DRAFT", "PENDING"].includes(c.status),
      );
      const ids =
        proposal && Array.isArray(proposal.payload)
          ? proposal.payload.map(String)
          : selected.map((f) => f.facilityId);
      content = (
        <VendorFacilitiesEditor
          key={id}
          vendorId={id}
          allFacilities={facilities.filter((f) => f.status === "ACTIVE")}
          selectedFacilityIds={ids}
          readOnly={!editable || frozen}
        />
      );
      break;
    }
    case "plans":
      content = (
        <PlanList vendorId={id} plans={await listMembershipPlans(id)} />
      );
      break;
    case "schedule":
      content = (
        <VendorScheduleEditor
          vendorId={id}
          schedules={await getVendorSchedule(id)}
        />
      );
      break;
    case "photos": {
      const rows = await prisma.vendorMedia.findMany({
        where: { vendorId: id },
        orderBy: { sortOrder: "asc" },
      });
      const media = overlayRows(
        rows,
        changes.filter((c) => ["DRAFT", "PENDING"].includes(c.status)),
        "MEDIA",
        {
          vendorId: id,
          mediaUrl: "",
          mediaType: "IMAGE",
          externalId: null,
          isPrimary: false,
          sortOrder: 0,
          createdAt: new Date(),
        },
      );
      for (const c of changes.filter(
        (c) =>
          c.kind === "MEDIA_PRIMARY" && ["DRAFT", "PENDING"].includes(c.status),
      ))
        for (const m of media) m.isPrimary = m.id === c.targetId;
      content = <VendorMediaGallery vendorId={id} media={media} />;
      break;
    }
    case "category": {
      let details: React.ReactNode;
      switch (vendor.category.slug) {
        case "library":
          details = (
            <SeatConfiguration
              vendorId={id}
              seatTypes={await listLibrarySeatTypes(id)}
            />
          );
          break;
        case "gym":
          details = (
            <TrainersList
              vendorId={id}
              trainers={await listTrainers(id)}
              allSpecializations={await listTrainerSpecializations()}
            />
          );
          break;
        case "co-working-space":
          details = (
            <MenuEditor vendorId={id} categories={await listMenu(id)} />
          );
          break;
        case "exam-hub":
          details = (
            <AcademicsPanel
              vendorId={id}
              teachers={await listTeachers(id)}
              courses={await listCourses(id)}
              subjects={await listSubjects()}
            />
          );
          break;
        default:
          details = <p>This service is not supported yet.</p>;
      }
      content = (
        <div className="space-y-6">
          {vendor.category.slug !== "library" && (
            <VendorCapacityCard vendorId={id} capacity={vendor.capacity} />
          )}{" "}
          {details}
        </div>
      );
      break;
    }
    case "review":
      content = (
        <SetupReview
          vendorId={id}
          {...await getListingReadiness(id)}
          status={vendor.status}
        />
      );
      break;
    case "changes":
      content = (
        <ListingChangeList
          revisions={await listListingRevisions(id)}
          labels={await proposalLabels(id)}
        />
      );
      break;
    case "occupancy":
      content = (
        <LibraryOccupancyPanel
          data={await getLibraryOccupancy(
            id,
            query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date)
              ? query.date
              : new Date().toLocaleDateString("en-CA", {
                  timeZone: vendor.timeZone,
                }),
          )}
        />
      );
      break;
    case "bookings":
      content = <BookingTable bookings={await listVendorBookings(id)} />;
      break;
    case "subscriptions":
      content = (
        <SubscriptionTable
          subscriptions={
            (await listSubscriptions({ vendorId: id, pageSize: 100 })).items
          }
          showCustomer
        />
      );
      break;
    case "reviews":
      content = (
        <ReviewTable
          reviews={(await listReviews({ vendorId: id, pageSize: 100 })).items}
        />
      );
      break;
    default:
      content = null;
  }
  const index = SETUP_STEPS.findIndex(([key]) => key === tab);
  return (
    <div className="space-y-6 min-w-0">
      <Link
        href={`/partners/${vendor.partnerId}/vendors`}
        className="text-sm text-primary underline"
      >
        {vendor.partner.name} / Listings
      </Link>
      <PageHeader
        eyebrow={vendor.category.name}
        title={vendor.name}
        description={`Listing state: ${vendor.status.replaceAll("_", " ")} · Approved content version ${vendor.contentVersion}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <VendorStatusBadge status={vendor.status} />
            <VendorLifecycleActions
              vendorId={id}
              status={vendor.status}
              submissionVersion={vendor.submissionVersion}
            />
          </div>
        }
      />
      {changes.some((c) => ["DRAFT", "PENDING"].includes(c.status)) && (
        <p role="status" className="rounded-lg border bg-muted p-4 text-sm">
          Editors show proposed content. Customers still see the approved
          version.{" "}
          {frozen
            ? "Your revision is submitted and frozen until a decision or withdrawal. "
            : "Your revision is a draft and must be submitted for approval. "}
          <Link
            href={`/vendors/${id}?tab=changes`}
            className="font-medium text-primary underline"
          >
            {frozen
              ? "View approval status"
              : "Open Changes to submit revision"}
          </Link>
        </p>
      )}
      <nav
        aria-label="Listing setup and operations"
        className="flex flex-wrap gap-2 border-b pb-4"
      >
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            href={`/vendors/${id}?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={`whitespace-nowrap rounded-md border px-3 py-2 text-sm ${tab === key ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <section className="rounded-lg border bg-card p-4 sm:p-6">
        {content}
      </section>
      {index >= 0 && (
        <nav
          aria-label="Setup steps"
          className="flex flex-wrap justify-between gap-3"
        >
          {index > 0 ? (
            <Link
              className="rounded border px-4 py-2 text-sm"
              href={`/vendors/${id}?tab=${SETUP_STEPS[index - 1][0]}`}
            >
              Previous step
            </Link>
          ) : (
            <span />
          )}
          {index < SETUP_STEPS.length - 1 && (
            <Link
              className="rounded border px-4 py-2 text-sm"
              href={`/vendors/${id}?tab=${SETUP_STEPS[index + 1][0]}`}
            >
              Next: {SETUP_STEPS[index + 1][1]}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
