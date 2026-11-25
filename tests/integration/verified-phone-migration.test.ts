import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
it("keeps the earliest verified owner, revokes later links and preserves booking snapshots", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE SCHEMA admin; CREATE ROLE anon; CREATE ROLE authenticated;",
    );
    await db.exec(
      readFileSync(
        "prisma/migrations/20261123190000_booking_customer_details/migration.sql",
        "utf8",
      ),
    );
    await db.exec(`INSERT INTO admin.customer_booking_details(user_id,phone,phone_verified_at,verification_method,challenge_id,challenge_expires_at)
   VALUES ('owner','+919876543210','2026-01-01','static',null,null),('later','+919876543210','2026-01-02','static','stale',now()),('draft','+919876543210',null,null,null,null);
   INSERT INTO admin.booking_customer_snapshots VALUES ('booking','later','Reader','+919876543210','Graduation','Reading','','2026-01-02','static');`);
    await db.exec(
      readFileSync(
        "prisma/migrations/20261125010000_unique_verified_customer_phone/migration.sql",
        "utf8",
      ),
    );
    const { rows } = await db.query<{
      user_id: string;
      phone_verified_at: Date | null;
      challenge_id: string | null;
    }>(
      "SELECT user_id,phone_verified_at,challenge_id FROM admin.customer_booking_details ORDER BY user_id",
    );
    expect(
      rows.find((row) => row.user_id === "owner")?.phone_verified_at,
    ).not.toBeNull();
    expect(rows.find((row) => row.user_id === "later")).toMatchObject({
      phone_verified_at: null,
      challenge_id: null,
    });
    expect(rows).toHaveLength(3);
    expect(
      (await db.query("SELECT * FROM admin.booking_customer_snapshots")).rows,
    ).toHaveLength(1);
    await expect(
      db.exec(
        "UPDATE admin.customer_booking_details SET phone_verified_at=now() WHERE user_id='later'",
      ),
    ).rejects.toMatchObject({ code: "23505" });
  } finally {
    await db.close();
  }
});
