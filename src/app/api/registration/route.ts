import { createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  organization: z.string().trim().min(2).max(150),
  email: z.email().transform((value) => value.toLowerCase()),
  phone: z.string().regex(/^\+?[\d\s-]{7,20}$/),
  password: z
    .string()
    .min(12)
    .max(72)
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= 72,
      "Password is too long",
    ),
  service: z.string().min(1).max(100),
});

export async function POST(request: Request) {
  try {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret)
      return Response.json(
        { error: "Registration is temporarily unavailable" },
        { status: 503 },
      );
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const hour = Math.floor(Date.now() / 3_600_000);
    const key = createHmac("sha256", secret)
      .update(`registration:${ip}:${hour}`)
      .digest("hex");
    const attempts = await prisma.$queryRaw<
      { count: number }[]
    >`INSERT INTO admin.request_throttles(key,count,expires_at) VALUES(${key},1,now()+interval '2 hours') ON CONFLICT(key) DO UPDATE SET count=admin.request_throttles.count+1 RETURNING count`;
    if (attempts[0].count > 5)
      return Response.json(
        { error: "Too many applications. Please try later." },
        { status: 429 },
      );
    const data = schema.parse(await request.json());
    const category = await prisma.vendorCategory.findUnique({
      where: { slug: data.service },
    });
    // Applications are accepted for every active category. Launch gating
    // (launchEnabled) still controls listing onboarding and publication.
    if (!category || category.status !== "ACTIVE")
      return Response.json(
        { error: "This service is not available. Choose another service." },
        { status: 400 },
      );
    const passwordHash = await bcrypt.hash(data.password, 12);
    await prisma.$transaction(async (tx) => {
      const role = await tx.role.findUniqueOrThrow({
        where: { name: "PARTNER_ADMIN" },
      });
      const existing = await tx.user.findUnique({
        where: { email: data.email },
        include: { partner: true, roles: { include: { role: true } } },
      });
      let partner;
      if (existing) {
        if (
          existing.status !== "ACTIVE" ||
          !existing.partnerId ||
          existing.partner?.approvalStatus !== "REJECTED" ||
          !existing.roles.some((r) => r.role.name === "PARTNER_ADMIN") ||
          existing.roles.some((r) => r.role.name === "SUPER_ADMIN") ||
          !(await bcrypt.compare(data.password, existing.passwordHash))
        )
          throw new Error("APPLICATION_CONFLICT");
        await tx.$queryRaw`SELECT id FROM admin.partners WHERE id=${existing.partnerId} FOR UPDATE`;
        const current = await tx.partner.findUniqueOrThrow({
          where: { id: existing.partnerId },
        });
        if (current.approvalStatus !== "REJECTED")
          throw new Error("APPLICATION_CONFLICT");
        partner = await tx.partner.update({
          where: { id: current.id },
          data: {
            name: data.organization,
            email: data.email,
            phone: data.phone,
            status: "INACTIVE",
            approvalStatus: "PENDING",
            applicationReason: null,
            requestedServiceId: category.id,
            applicationVersion: { increment: 1 },
          },
        });
        await tx.user.update({
          where: { id: existing.id },
          data: { name: data.name, phone: data.phone },
        });
        await tx.auditLog.create({
          data: {
            userId: existing.id,
            partnerId: partner.id,
            action: "RESUBMIT_PARTNER_APPLICATION",
            entityType: "partner",
            entityId: partner.id,
            oldValue: {
              version: current.applicationVersion,
              status: current.approvalStatus,
              reason: current.applicationReason,
            },
            newValue: {
              version: partner.applicationVersion,
              name: data.organization,
              service: category.id,
            },
          },
        });
      } else {
        const user = await tx.user.create({
          data: {
            name: data.name,
            email: data.email,
            phone: data.phone,
            passwordHash,
            roles: { create: { roleId: role.id } },
          },
        });
        partner = await tx.partner.create({
          data: {
            name: data.organization,
            email: data.email,
            phone: data.phone,
            status: "INACTIVE",
            approvalStatus: "PENDING",
            requestedServiceId: category.id,
            createdById: user.id,
          },
        });
        await tx.user.update({
          where: { id: user.id },
          data: { partnerId: partner.id },
        });
      }
      const reviewers = await tx.user.findMany({
        where: {
          status: "ACTIVE",
          roles: { some: { role: { name: "SUPER_ADMIN" } } },
        },
        select: { id: true },
      });
      await tx.portalNotification.createMany({
        data: reviewers.map((reviewer) => ({
          userId: reviewer.id,
          title: "New partner application",
          body: `${data.organization} applied to offer ${category.name}. Review the application to activate the organization.`,
          href: `/partners/${partner.id}`,
        })),
      });
    });
    return Response.json({ submitted: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "APPLICATION_CONFLICT")
      return Response.json(
        {
          error:
            "An account already exists. Rejected applicants can resubmit with their existing email and password; otherwise sign in or contact support.",
        },
        { status: 409 },
      );
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Check all fields. Use a password of 12–72 characters." },
        { status: 400 },
      );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return Response.json(
        {
          error:
            "An account with this email or phone number already exists. Sign in or contact support.",
        },
        { status: 409 },
      );
    console.error("Partner registration failed", error);
    return Response.json(
      { error: "Could not submit. Please try again later." },
      { status: 500 },
    );
  }
}
