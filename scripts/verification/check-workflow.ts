import { chromium, expect, type Page } from "@playwright/test";
import { Client } from "pg";

async function main() {
  const connectionString = process.env.WORKFLOW_TEST_DATABASE_URL;
  if (
    !connectionString ||
    new URL(connectionString).pathname !== "/readify_workflow_test" ||
    !["127.0.0.1", "localhost"].includes(new URL(connectionString).hostname)
  )
    throw new Error("Explicit disposable local workflow database required");
  const db = new Client({ connectionString });
  await db.connect();
  const browser = await chromium
    .launch({
      headless: true,
      executablePath: process.env.WORKFLOW_CHROMIUM_PATH,
    })
    .catch(async (error) => {
      await db.end();
      throw error;
    });
  const errors: string[] = [];
  async function login(email: string) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://localhost:3107/login");
    await page.getByLabel("Email address").fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Workflow-test-only-72!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.includes("/login"));
    return page;
  }
  async function open(page: Page, tab: string) {
    await page.goto(`http://localhost:3107/vendors/listing?tab=${tab}`);
    await expect(
      page.getByText("Workflow Library", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Something went wrong", { exact: false }),
    ).toHaveCount(0);
  }
  const scalar = async (sql: string) =>
    Object.values((await db.query(sql)).rows[0])[0];
  try {
    const owner = await login("owner@test.invalid");
    await open(owner, "facilities");
    await owner.getByRole("checkbox", { name: "WiFi", exact: true }).check();
    await owner.getByRole("button", { name: "Save Facilities" }).click();
    await expect(
      owner.getByRole("status").filter({ hasText: "Draft facilities saved." }),
    ).toBeVisible();
    if (
      (await scalar(
        "SELECT count(*)::int FROM admin.vendor_facilities WHERE vendor_id='listing'",
      )) !== 1
    )
      throw new Error("Draft save missing");
    for (const tab of [
      "overview",
      "address",
      "verification",
      "schedule",
      "category",
      "plans",
      "photos",
      "bookings",
      "subscriptions",
      "reviews",
      "review",
    ])
      await open(owner, tab);
    await expect(
      owner.getByRole("button", { name: "Submit complete listing" }),
    ).toBeEnabled();
    await owner
      .getByRole("button", { name: "Submit complete listing" })
      .click();
    await expect(
      owner.getByRole("button", { name: "Submit complete listing" }),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        scalar("SELECT status::text FROM admin.vendors WHERE id='listing'"),
      )
      .toBe("UNDER_REVIEW");
    await expect(
      owner.getByText("Current state: UNDER REVIEW.", { exact: false }),
    ).toBeVisible();
    if (
      (await scalar(
        "SELECT count(*)::int FROM public.published_listings WHERE id='listing'",
      )) !== 0
    )
      throw new Error("Unapproved listing visible");
    const admin = await login("admin@test.invalid");
    await open(admin, "review");
    await admin.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(
      admin.getByRole("button", { name: "Publish", exact: true }),
    ).toBeVisible();
    await admin.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(
      admin.getByRole("button", { name: "Suspend", exact: true }),
    ).toBeVisible();
    if (
      (await scalar(
        "SELECT count(*)::int FROM public.published_listings WHERE id='listing'",
      )) !== 1
    )
      throw new Error("Publication missing");
    await open(owner, "facilities");
    await owner.getByRole("checkbox", { name: "AC", exact: true }).check();
    await owner.getByRole("button", { name: "Save Facilities" }).click();
    await expect(
      owner
        .getByRole("status")
        .filter({ hasText: "Proposed facilities saved." }),
    ).toBeVisible();
    if (
      (await scalar(
        "SELECT count(*)::int FROM admin.vendor_facilities WHERE vendor_id='listing'",
      )) !== 1
    )
      throw new Error("Proposal leaked into live data");
    await open(owner, "changes");
    await owner
      .getByRole("button", { name: "Submit revision", exact: true })
      .click();
    await expect(owner.getByText("PENDING", { exact: true })).toBeVisible();
    await open(owner, "facilities");
    await expect(
      owner.getByRole("button", { name: "Save Facilities" }),
    ).toHaveCount(0);
    await open(admin, "changes");
    await admin
      .getByRole("button", { name: "Approve revision", exact: true })
      .click();
    await expect(admin.getByText("APPROVED", { exact: true })).toBeVisible();
    if (
      (await scalar(
        "SELECT count(*)::int FROM admin.vendor_facilities WHERE vendor_id='listing'",
      )) !== 2
    )
      throw new Error("Approved proposal not applied");
    await open(owner, "facilities");
    await owner.getByRole("checkbox", { name: "WiFi", exact: true }).uncheck();
    await owner.getByRole("button", { name: "Save Facilities" }).click();
    await expect(
      owner
        .getByRole("status")
        .filter({ hasText: "Proposed facilities saved." }),
    ).toBeVisible();
    await open(owner, "changes");
    await owner
      .getByRole("button", { name: "Submit revision", exact: true })
      .click();
    await expect(owner.getByText("PENDING", { exact: true })).toBeVisible();
    await open(admin, "changes");
    await admin
      .getByLabel("Revision rejection reason")
      .fill("Retain the approved facilities");
    await admin
      .getByRole("button", { name: "Reject revision", exact: true })
      .click();
    await expect(admin.getByText("REJECTED", { exact: true })).toBeVisible();
    if (
      (await scalar(
        "SELECT count(*)::int FROM admin.vendor_facilities WHERE vendor_id='listing'",
      )) !== 2
    )
      throw new Error("Rejected content changed live facilities");
    await open(owner, "changes");
    await owner
      .getByRole("button", { name: "Copy for correction", exact: true })
      .click();
    await expect(
      owner.getByRole("button", { name: "Submit revision", exact: true }),
    ).toBeVisible();
    await owner
      .getByRole("button", { name: "Submit revision", exact: true })
      .click();
    await expect(owner.getByText("PENDING", { exact: true })).toBeVisible();
    await owner
      .getByRole("button", { name: "Withdraw revision", exact: true })
      .click();
    await expect(owner.getByText("WITHDRAWN", { exact: true })).toBeVisible();
    for (const section of [
      "",
      "vendors",
      "plans",
      "subscriptions",
      "bookings",
      "customers",
      "service-management",
      "payments",
      "reviews",
      "team",
      "approvals",
      "support",
      "history",
    ]) {
      await admin.goto(
        `http://localhost:3107/partners/org${section ? "/" + section : ""}`,
      );
      await expect(
        admin
          .getByText("Workflow Library Organization", { exact: true })
          .first(),
      ).toBeVisible();
      await expect(
        admin.getByText("Something went wrong", { exact: false }),
      ).toHaveCount(0);
    }
    if (errors.length) throw new Error(errors.join("\n"));
    const other = await login("other@test.invalid");
    await other.goto("http://localhost:3107/vendors/listing?tab=facilities");
    await expect(
      other.getByRole("button", { name: "Save Facilities" }),
    ).toHaveCount(0);
    // A denied tenant route may intentionally raise the route boundary. Capture
    // only errors from authorized pages above as workflow regressions.

    console.log(
      "PASS: draft Facilities save, all setup sections, immutable submission, approval/publication, live isolation, whole-revision approval, partner modules, cross-tenant denial.",
    );
  } finally {
    await browser.close();
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
