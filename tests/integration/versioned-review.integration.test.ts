import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { launchDatabase } from "../helpers/launch-database";

describe("versioned listing evidence and upgrade (isolated PostgreSQL)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await launchDatabase(async (db, name) => {
      if (name !== "20261111120000_versioned_listing_review") return;
      await db.exec(`
    INSERT INTO admin.users(id,name,email,password_hash,updated_at) VALUES('reviewer','Reviewer','reviewer@test.invalid','hash',now());
    INSERT INTO admin.partners(id,name,created_by,updated_at) VALUES('org','Organization','reviewer',now());
    INSERT INTO admin.vendor_categories(id,name,slug,updated_at) VALUES('cat','Library','library',now());
    INSERT INTO admin.vendors(id,name,slug,phone,category_id,partner_id,status,created_by,updated_at) VALUES('listing','Listing','listing','9999999999','cat','org','PUBLISHED','reviewer',now());
    INSERT INTO admin.listing_changes(id,vendor_id,kind,target_id,payload,requested_by) VALUES('legacy-one','listing','PROFILE','listing','{"name":"Proposed"}','reviewer'),('legacy-two','listing','CAPACITY','listing','{"capacity":20}','reviewer');
   `);
    });
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("preserves and groups legacy pending changes without publishing them", async () => {
    const revision = await db.query<{ status: string; base_version: number }>(
      "SELECT status,base_version FROM admin.listing_revisions WHERE id=$1",
      ["legacy-listing"],
    );
    expect(revision.rows[0]).toEqual({ status: "PENDING", base_version: 0 });
    expect(
      (
        await db.query(
          "SELECT * FROM admin.listing_changes WHERE revision_id='legacy-listing'",
        )
      ).rows,
    ).toHaveLength(2);
    expect(
      (
        await db.query<{ name: string }>(
          "SELECT name FROM admin.vendors WHERE id='listing'",
        )
      ).rows[0].name,
    ).toBe("Listing");
  });
  it("freezes submitted payloads and rejects new changes in a submitted envelope", async () => {
    await expect(
      db.exec(
        `UPDATE admin.listing_changes SET payload='{}' WHERE id='legacy-one'`,
      ),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.exec(`DELETE FROM admin.listing_changes WHERE id='legacy-one'`),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.exec(
        `INSERT INTO admin.listing_changes(id,vendor_id,revision_id,kind,target_id,payload,requested_by) VALUES('late','listing','legacy-listing','CAPACITY','listing','{}','reviewer')`,
      ),
    ).rejects.toThrow(/immutable/);
  });
  it("allows final decision metadata while keeping submitted evidence intact", async () => {
    await db.exec(
      `UPDATE admin.listing_changes SET status='REJECTED',reviewed_by='reviewer',reviewed_at=now(),reason='Correct details' WHERE revision_id='legacy-listing'; UPDATE admin.listing_revisions SET status='REJECTED' WHERE id='legacy-listing';`,
    );
    expect(
      (
        await db.query<{ payload: unknown }>(
          "SELECT payload FROM admin.listing_changes WHERE id='legacy-one'",
        )
      ).rows[0].payload,
    ).toEqual({ name: "Proposed" });
  });
  it("allows one editable or submitted revision per listing, while retaining historical decisions", async () => {
    await db.exec(
      `INSERT INTO admin.listing_revisions(id,vendor_id,base_version,requested_by) VALUES('draft','listing',0,'reviewer')`,
    );
    await expect(
      db.exec(
        `INSERT INTO admin.listing_revisions(id,vendor_id,base_version,requested_by) VALUES('duplicate','listing',0,'reviewer')`,
      ),
    ).rejects.toThrow(/unique/);
  });
  it("persists draft operations and permits withdrawing them without publishing", async () => {
    await db.exec(`INSERT INTO admin.listing_changes(id,vendor_id,revision_id,kind,target_id,payload,requested_by,status) VALUES('editable','listing','draft','CAPACITY','listing','{"capacity":25}','reviewer','DRAFT');
      UPDATE admin.listing_changes SET payload='{"capacity":30}' WHERE id='editable';
      UPDATE admin.listing_changes SET status='WITHDRAWN' WHERE id='editable';
      UPDATE admin.listing_revisions SET status='WITHDRAWN' WHERE id='draft';`);
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM admin.listing_changes WHERE id='editable'",
        )
      ).rows[0].status,
    ).toBe("WITHDRAWN");
    expect(
      (
        await db.query<{ name: string }>(
          "SELECT name FROM admin.vendors WHERE id='listing'",
        )
      ).rows[0].name,
    ).toBe("Listing");
    // Keep an active envelope for the later rollback/conflict scenario.
    await db.exec(
      `INSERT INTO admin.listing_revisions(id,vendor_id,base_version,requested_by) VALUES('next-draft','listing',0,'reviewer')`,
    );
  });
  it("keeps initial submission snapshots immutable even after decisions", async () => {
    await db.exec(
      `INSERT INTO admin.listing_submissions(id,vendor_id,version,snapshot,digest,requested_by) VALUES('submission','listing',1,'{"name":"Submitted"}','hash','reviewer'); UPDATE admin.listing_submissions SET status='APPROVED',reviewed_at=now() WHERE id='submission';`,
    );
    await expect(
      db.exec(
        `UPDATE admin.listing_submissions SET snapshot='{}' WHERE id='submission'`,
      ),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.exec(`DELETE FROM admin.listing_submissions WHERE id='submission'`),
    ).rejects.toThrow(/immutable/);
  });
  it("submits a new entity and its follow-up edit atomically in one envelope", async () => {
    await db.exec(`INSERT INTO admin.listing_changes(id,vendor_id,revision_id,kind,target_id,payload,requested_by,status) VALUES
      ('plan-create','listing','next-draft','PLAN_CREATE','proposed-plan','{}','reviewer','DRAFT'),
      ('plan-update','listing','next-draft','PLAN_UPDATE','proposed-plan','{}','reviewer','DRAFT');
      UPDATE admin.listing_changes SET status='PENDING' WHERE revision_id='next-draft';
      UPDATE admin.listing_revisions SET status='PENDING' WHERE id='next-draft';`);
    expect(
      (
        await db.query(
          "SELECT id FROM admin.listing_changes WHERE revision_id='next-draft' AND status='PENDING'",
        )
      ).rows,
    ).toHaveLength(2);
  });
  it("rolls back partial content changes if a later revision operation fails", async () => {
    await db.exec("BEGIN");
    try {
      await db.exec(
        `UPDATE admin.vendors SET name='Must roll back' WHERE id='listing'`,
      );
      await db.exec(
        `INSERT INTO admin.listing_revisions(id,vendor_id,base_version,requested_by) VALUES('conflict','listing',0,'reviewer')`,
      );
    } catch {
      await db.exec("ROLLBACK");
    }
    expect(
      (
        await db.query<{ name: string }>(
          "SELECT name FROM admin.vendors WHERE id='listing'",
        )
      ).rows[0].name,
    ).toBe("Listing");
  });
  it("keeps internal evidence unavailable to Supabase customer roles", async () => {
    const result = await db.query<{ allowed: boolean }>(
      "SELECT has_table_privilege('authenticated','admin.listing_submissions','SELECT') allowed",
    );
    expect(result.rows[0].allowed).toBe(false);
  });
});
