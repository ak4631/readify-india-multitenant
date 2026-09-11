import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../src/config/permissions";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

const FACILITIES = [
  "AC",
  "WiFi",
  "Parking",
  "Power Backup",
  "CCTV",
  "Drinking Water",
  "Washroom",
  "Locker",
  "24x7",
  "Food",
  "Beverages",
  "Charging Points",
];

const VENDOR_CATEGORIES = [
  { name: "Library", slug: "library" },
  { name: "Gym", slug: "gym" },
  { name: "Study Cafe", slug: "study-cafe" },
  { name: "Exam Hub", slug: "exam-hub" },
];

const TRAINER_SPECIALIZATIONS = [
  "Strength Training",
  "Weight Loss",
  "Yoga",
  "Cardio",
  "CrossFit",
  "Physiotherapy",
  "Nutrition Coaching",
  "Zumba",
];

const SUBJECTS = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "English",
  "Computer Science",
  "General Knowledge",
  "Reasoning",
];

async function seedPermissions() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: { key: permission.key, description: permission.description },
    });
  }
  console.log(`Seeded ${PERMISSIONS.length} permissions.`);
}

async function seedRoles() {
  const allPermissionKeys = PERMISSIONS.map((p) => p.key);

  for (const [roleName, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });

    const keys = permissionKeys === "*" ? allPermissionKeys : permissionKeys;
    const permissions = await prisma.permission.findMany({ where: { key: { in: keys } } });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }
  }
  console.log(`Seeded ${Object.keys(ROLE_PERMISSIONS).length} roles.`);
}

async function seedVendorCategories() {
  for (const [index, category] of VENDOR_CATEGORIES.entries()) {
    await prisma.vendorCategory.upsert({
      where: { slug: category.slug },
      update: {},
      create: { ...category, sortOrder: index },
    });
  }
  console.log(`Seeded ${VENDOR_CATEGORIES.length} vendor categories.`);
}

async function seedFacilities() {
  for (const name of FACILITIES) {
    await prisma.facility.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Seeded ${FACILITIES.length} facilities.`);
}

async function seedTrainerSpecializations() {
  for (const name of TRAINER_SPECIALIZATIONS) {
    await prisma.trainerSpecialization.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Seeded ${TRAINER_SPECIALIZATIONS.length} trainer specializations.`);
}

async function seedSubjects() {
  for (const name of SUBJECTS) {
    await prisma.subject.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Seeded ${SUBJECTS.length} subjects.`);
}

async function seedSuperAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env before seeding.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { name: "Super Admin", email, passwordHash },
  });

  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: user.id, roleId: superAdminRole.id },
  });

  console.log(`Seeded SUPER_ADMIN user: ${email}`);
}

async function main() {
  await seedPermissions();
  await seedRoles();
  await seedVendorCategories();
  await seedFacilities();
  await seedTrainerSpecializations();
  await seedSubjects();
  await seedSuperAdmin();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
