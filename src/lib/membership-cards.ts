import "server-only";
import { prisma } from "@/lib/prisma";
import { getSignedDocumentUrl } from "@/lib/imagekit";

export type MembershipCardDetails = {
  id: string;
  order_id: string;
  user_id: string;
  vendor_id: string;
  target_id: string;
  customer_name: string;
  vendor_name: string;
  category: string;
  plan_name: string;
  valid_from: Date;
  valid_until: Date;
  slot_start: string | null;
  slot_hours: number | null;
  qr_value: string;
  status: string;
  photo_path: string;
  verified_by: string;
  verified_at: Date;
  activated_at: Date;
  time_zone: string;
  captured_at: Date;
};
export async function customerMembershipCards(userId: string) {
  const rows = await prisma.$queryRaw<MembershipCardDetails[]>`
    SELECT id,order_id,user_id,vendor_id,target_id,customer_name,vendor_name,category,
      plan_name,valid_from,valid_until,slot_start,slot_hours,qr_value,status,photo_path,
      verified_by,verified_at,activated_at,time_zone,captured_at FROM admin.membership_card_details WHERE user_id=${userId} ORDER BY activated_at DESC`;
  return Promise.all(
    rows.map(async ({ photo_path, ...row }) => ({
      ...row,
      valid_from: row.valid_from.toISOString().slice(0, 10),
      valid_until: row.valid_until.toISOString().slice(0, 10),
      photo_url: await getSignedDocumentUrl(photo_path, 900),
      card_title: /gym|fitness/i.test(row.category)
        ? "Gym Membership Card"
        : /cowork|co-work|study-cafe/i.test(row.category)
          ? "Co-working Access Card"
          : "Library Membership Card",
    })),
  );
}
