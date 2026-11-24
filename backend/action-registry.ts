import * as module0 from "@/server/actions/approval-queue.actions";
import * as module1 from "@/server/actions/attendance.actions";
import * as module2 from "@/server/actions/audit-logs.actions";
import * as module3 from "@/server/actions/bookings.actions";
import * as module4 from "@/server/actions/courses.actions";
import * as module5 from "@/server/actions/customer-support.actions";
import * as module6 from "@/server/actions/customers.actions";
import * as module7 from "@/server/actions/dashboard.actions";
import * as module8 from "@/server/actions/facilities.actions";
import * as module9 from "@/server/actions/geocoding.actions";
import * as module10 from "@/server/actions/library-occupancy.actions";
import * as module11 from "@/server/actions/library-seat-types.actions";
import * as module12 from "@/server/actions/listing-changes.actions";
import * as module13 from "@/server/actions/marketing.actions";
import * as module14 from "@/server/actions/membership-activation.actions";
import * as module15 from "@/server/actions/membership-plans.actions";
import * as module16 from "@/server/actions/menu.actions";
import * as module17 from "@/server/actions/notifications.actions";
import * as module18 from "@/server/actions/page-data.actions";
import * as module19 from "@/server/actions/partners.actions";
import * as module20 from "@/server/actions/payment-settings.actions";
import * as module21 from "@/server/actions/pending-payments.actions";
import * as module22 from "@/server/actions/promotions.actions";
import * as module23 from "@/server/actions/reviews.actions";
import * as module24 from "@/server/actions/subscriptions.actions";
import * as module25 from "@/server/actions/support.actions";
import * as module26 from "@/server/actions/teachers.actions";
import * as module27 from "@/server/actions/trainers.actions";
import * as module28 from "@/server/actions/users.actions";
import * as module29 from "@/server/actions/vendor-categories.actions";
import * as module30 from "@/server/actions/vendor-facilities.actions";
import * as module31 from "@/server/actions/vendor-media.actions";
import * as module32 from "@/server/actions/vendor-schedule.actions";
import * as module33 from "@/server/actions/vendor-verification.actions";
import * as module34 from "@/server/actions/vendors.actions";
import * as module35 from "@/server/actions/workspace.actions";
export const actions: Record<string, (...args: never[]) => Promise<unknown>> = {
  "approval-queue.actions.listApprovalQueue": module0.listApprovalQueue,
  "attendance.actions.checkInByCode": module1.checkInByCode,
  "attendance.actions.checkOutVisit": module1.checkOutVisit,
  "audit-logs.actions.listAuditLogs": module2.listAuditLogs,
  "bookings.actions.listVendorBookings": module3.listVendorBookings,
  "bookings.actions.listWorkspaceBookings": module3.listWorkspaceBookings,
  "bookings.actions.listBookingListingOptions": module3.listBookingListingOptions,
  "courses.actions.listSubjects": module4.listSubjects,
  "courses.actions.listCourses": module4.listCourses,
  "courses.actions.createCourse": module4.createCourse,
  "courses.actions.updateCourse": module4.updateCourse,
  "courses.actions.archiveCourse": module4.archiveCourse,
  "courses.actions.setCourseTeachers": module4.setCourseTeachers,
  "courses.actions.createLecture": module4.createLecture,
  "courses.actions.cancelLecture": module4.cancelLecture,
  "customer-support.actions.listCustomerSupportTickets": module5.listCustomerSupportTickets,
  "customer-support.actions.respondToCustomerTicket": module5.respondToCustomerTicket,
  "customers.actions.listCustomers": module6.listCustomers,
  "dashboard.actions.getDashboardMetrics": module7.getDashboardMetrics,
  "facilities.actions.listFacilities": module8.listFacilities,
  "facilities.actions.listFacilitiesPage": module8.listFacilitiesPage,
  "facilities.actions.createFacility": module8.createFacility,
  "facilities.actions.updateFacility": module8.updateFacility,
  "facilities.actions.deactivateFacility": module8.deactivateFacility,
  "geocoding.actions.searchAddressAction": module9.searchAddressAction,
  "geocoding.actions.reverseGeocodeAction": module9.reverseGeocodeAction,
  "library-occupancy.actions.getLibraryOccupancy": module10.getLibraryOccupancy,
  "library-occupancy.actions.cancelLibraryBooking": module10.cancelLibraryBooking,
  "library-occupancy.actions.setLibrarySeatActive": module10.setLibrarySeatActive,
  "library-seat-types.actions.listLibrarySeatTypes": module11.listLibrarySeatTypes,
  "library-seat-types.actions.createLibrarySeatType": module11.createLibrarySeatType,
  "library-seat-types.actions.updateLibrarySeatType": module11.updateLibrarySeatType,
  "library-seat-types.actions.deleteLibrarySeatType": module11.deleteLibrarySeatType,
  "listing-changes.actions.listListingChanges": module12.listListingChanges,
  "listing-changes.actions.listListingRevisions": module12.listListingRevisions,
  "listing-changes.actions.submitListingRevision": module12.submitListingRevision,
  "listing-changes.actions.withdrawListingRevision": module12.withdrawListingRevision,
  "listing-changes.actions.reviseListingRevision": module12.reviseListingRevision,
  "listing-changes.actions.reopenListingRevisionForCorrection": module12.reopenListingRevisionForCorrection,
  "listing-changes.actions.reviewListingRevision": module12.reviewListingRevision,
  "listing-changes.actions.discardDraftChange": module12.discardDraftChange,
  "marketing.actions.previewMarketingAudience": module13.previewMarketingAudience,
  "marketing.actions.createMarketingCampaign": module13.createMarketingCampaign,
  "marketing.actions.cancelMarketingCampaign": module13.cancelMarketingCampaign,
  "membership-activation.actions.reviewMembershipBooking": module14.reviewMembershipBooking,
  "membership-activation.actions.activateMembership": module14.activateMembership,
  "membership-plans.actions.listMembershipPlans": module15.listMembershipPlans,
  "membership-plans.actions.createMembershipPlan": module15.createMembershipPlan,
  "membership-plans.actions.updateMembershipPlan": module15.updateMembershipPlan,
  "membership-plans.actions.archiveMembershipPlan": module15.archiveMembershipPlan,
  "menu.actions.listMenu": module16.listMenu,
  "menu.actions.createMenuCategory": module16.createMenuCategory,
  "menu.actions.deleteMenuCategory": module16.deleteMenuCategory,
  "menu.actions.createMenuItem": module16.createMenuItem,
  "menu.actions.updateMenuItem": module16.updateMenuItem,
  "menu.actions.deleteMenuItem": module16.deleteMenuItem,
  "notifications.actions.listPortalNotifications": module17.listPortalNotifications,
  "notifications.actions.markPortalNotificationRead": module17.markPortalNotificationRead,
  "page-data.actions.getRegistrationServices": module18.getRegistrationServices,
  "page-data.actions.getAccountOrganization": module18.getAccountOrganization,
  "page-data.actions.getPartnerServices": module18.getPartnerServices,
  "page-data.actions.getPartnerDetails": module18.getPartnerDetails,
  "page-data.actions.getVendorFacilities": module18.getVendorFacilities,
  "page-data.actions.getVendorPhotos": module18.getVendorPhotos,
  "page-data.actions.getMarketingPageData": module18.getMarketingPageData,
  "page-data.actions.getPromotionsPageData": module18.getPromotionsPageData,
  "page-data.actions.getHostedCheckout": module18.getHostedCheckout,
  "page-data.actions.getPartnerHistory": module18.getPartnerHistory,
  "page-data.actions.getAdminPaymentSettings": module18.getAdminPaymentSettings,
  "page-data.actions.getVendorProposalLabels": module18.getVendorProposalLabels,
  "partners.actions.listPartners": module19.listPartners,
  "partners.actions.getPartnerById": module19.getPartnerById,
  "partners.actions.listPartnerUsers": module19.listPartnerUsers,
  "partners.actions.listAllPartnerUsers": module19.listAllPartnerUsers,
  "partners.actions.createPartner": module19.createPartner,
  "partners.actions.updatePartner": module19.updatePartner,
  "partners.actions.setPartnerActive": module19.setPartnerActive,
  "partners.actions.createPartnerUser": module19.createPartnerUser,
  "partners.actions.setPartnerUserActive": module19.setPartnerUserActive,
  "partners.actions.updatePartnerUser": module19.updatePartnerUser,
  "partners.actions.reviewPartnerApplication": module19.reviewPartnerApplication,
  "payment-settings.actions.savePaymentSettings": module20.savePaymentSettings,
  "pending-payments.actions.listPendingPayments": module21.listPendingPayments,
  "promotions.actions.savePromotionalBanner": module22.savePromotionalBanner,
  "promotions.actions.deactivatePromotionalBanner": module22.deactivatePromotionalBanner,
  "reviews.actions.listReviews": module23.listReviews,
  "reviews.actions.replyToReview": module23.replyToReview,
  "reviews.actions.hideReview": module23.hideReview,
  "reviews.actions.deleteReview": module23.deleteReview,
  "reviews.actions.restoreReview": module23.restoreReview,
  "subscriptions.actions.listSubscriptions": module24.listSubscriptions,
  "subscriptions.actions.cancelSubscription": module24.cancelSubscription,
  "support.actions.listSupportTickets": module25.listSupportTickets,
  "support.actions.createSupportTicket": module25.createSupportTicket,
  "support.actions.resolveSupportTicket": module25.resolveSupportTicket,
  "teachers.actions.listTeachers": module26.listTeachers,
  "teachers.actions.createTeacher": module26.createTeacher,
  "teachers.actions.updateTeacher": module26.updateTeacher,
  "teachers.actions.deactivateTeacher": module26.deactivateTeacher,
  "trainers.actions.listTrainers": module27.listTrainers,
  "trainers.actions.listTrainerSpecializations": module27.listTrainerSpecializations,
  "trainers.actions.createTrainer": module27.createTrainer,
  "trainers.actions.updateTrainer": module27.updateTrainer,
  "trainers.actions.deactivateTrainer": module27.deactivateTrainer,
  "trainers.actions.setTrainerSpecializations": module27.setTrainerSpecializations,
  "trainers.actions.addTrainerPricing": module27.addTrainerPricing,
  "trainers.actions.deleteTrainerPricing": module27.deleteTrainerPricing,
  "trainers.actions.setTrainerAvailability": module27.setTrainerAvailability,
  "users.actions.createVendorAccount": module28.createVendorAccount,
  "users.actions.listUsers": module28.listUsers,
  "users.actions.getUserById": module28.getUserById,
  "users.actions.suspendUser": module28.suspendUser,
  "users.actions.activateUser": module28.activateUser,
  "vendor-categories.actions.listVendorCategories": module29.listVendorCategories,
  "vendor-categories.actions.listVendorCategoriesPage": module29.listVendorCategoriesPage,
  "vendor-categories.actions.createVendorCategory": module29.createVendorCategory,
  "vendor-categories.actions.updateVendorCategory": module29.updateVendorCategory,
  "vendor-categories.actions.deactivateVendorCategory": module29.deactivateVendorCategory,
  "vendor-facilities.actions.setVendorFacilities": module30.setVendorFacilities,
  "vendor-media.actions.uploadVendorMedia": module31.uploadVendorMedia,
  "vendor-media.actions.deleteVendorMedia": module31.deleteVendorMedia,
  "vendor-media.actions.setPrimaryVendorMedia": module31.setPrimaryVendorMedia,
  "vendor-schedule.actions.getVendorSchedule": module32.getVendorSchedule,
  "vendor-schedule.actions.updateVendorSchedule": module32.updateVendorSchedule,
  "vendor-verification.actions.uploadVerificationDocument": module33.uploadVerificationDocument,
  "vendor-verification.actions.reviewVerificationDocument": module33.reviewVerificationDocument,
  "vendor-verification.actions.getVerificationDocumentUrl": module33.getVerificationDocumentUrl,
  "vendors.actions.listVendors": module34.listVendors,
  "vendors.actions.listVendorsPage": module34.listVendorsPage,
  "vendors.actions.getVendorById": module34.getVendorById,
  "vendors.actions.createVendorDraft": module34.createVendorDraft,
  "vendors.actions.updateVendorProfile": module34.updateVendorProfile,
  "vendors.actions.updateVendorCapacity": module34.updateVendorCapacity,
  "vendors.actions.updateVendorAddress": module34.updateVendorAddress,
  "vendors.actions.submitVendorForReview": module34.submitVendorForReview,
  "vendors.actions.approveVendor": module34.approveVendor,
  "vendors.actions.rejectVendor": module34.rejectVendor,
  "vendors.actions.publishVendor": module34.publishVendor,
  "vendors.actions.suspendVendor": module34.suspendVendor,
  "vendors.actions.reviseRejectedVendor": module34.reviseRejectedVendor,
  "vendors.actions.requestListingReactivation": module34.requestListingReactivation,
  "vendors.actions.getListingReadiness": module34.getListingReadiness,
  "vendors.actions.reopenLegacyListing": module34.reopenLegacyListing,
  "workspace.actions.getWorkspaceSummary": module35.getWorkspaceSummary,
  "workspace.actions.getOwnerControlPanel": module35.getOwnerControlPanel,
  "workspace.actions.listWorkspaceAttendance": module35.listWorkspaceAttendance,
  "workspace.actions.listPaymentLedger": module35.listPaymentLedger,
  "workspace.actions.listPaymentListingOptions": module35.listPaymentListingOptions,
};
