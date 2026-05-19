#!/usr/bin/env tsx
/**
 * Create a shared "demo" account plus two example clients for sales
 * walkthroughs. The account is head_office_admin so buyer demos see the full
 * admin surface area (Collateral, Users, Branches, Activity). Scoping to a
 * single demo branch is kept for the example client data only.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... pnpm --filter @workspace/api-server exec tsx src/seed-sales-demo.ts
 */
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db, pool, branchesTable, clientsTable, usersTable } from "@workspace/db";

const TELEGRAM_ID = "demo";
const PASSWORD = "demo";
const DISPLAY_NAME = "Minerva Guest Viewer";
const DEMO_BRANCH = { name: "Minerva Demo Branch", city: "Tashkent" };

const EXAMPLE_CLIENTS = [
  {
    externalUuid: "11111111-1111-4111-8111-111111111111",
    sessionId: "sales-demo-client-001",
    fullName: "Akmal Karimov",
    phone: "+998901234567",
    status: "lead" as const,
    clientType: "individual" as const,
    leadSource: "direct_visit",
    purpose: "Aylanma mablag' uchun kredit",
    desiredAmountUzs: "250000000.00",
    desiredTermMonths: 24,
    preferredCurrency: "UZS",
    preferredLanguage: "uz",
  },
  {
    externalUuid: "22222222-2222-4222-8222-222222222222",
    sessionId: "sales-demo-client-002",
    fullName: "Dilnoza Murodova",
    legalName: "BARAKA TEXTIL MCHJ",
    phone: "+998931112233",
    status: "recommendation" as const,
    clientType: "corporate" as const,
    leadSource: "referral_existing_client",
    purpose: "Uskuna xaridi va ishlab chiqarishni kengaytirish",
    desiredAmountUzs: "480000000.00",
    desiredTermMonths: 36,
    preferredCurrency: "UZS",
    preferredLanguage: "ru",
  },
];

async function findOrCreateDemoBranch() {
  const [existing] = await db
    .select()
    .from(branchesTable)
    .where(and(eq(branchesTable.name, DEMO_BRANCH.name), eq(branchesTable.city, DEMO_BRANCH.city)))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(branchesTable)
    .values({ ...DEMO_BRANCH, isActive: true })
    .returning();

  return created;
}

async function findOrCreateDemoUser(branchId: number) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.telegramId, TELEGRAM_ID)).limit(1);

  if (existing) {
    const [updated] = await db
      .update(usersTable)
      .set({
        name: DISPLAY_NAME,
        passwordHash,
        role: "head_office_admin",
        branchId,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.telegramId, TELEGRAM_ID))
      .returning();

    console.log(`Updated existing demo user (id=${updated.id})`);
    return updated;
  }

  const [created] = await db
    .insert(usersTable)
    .values({
      telegramId: TELEGRAM_ID,
      name: DISPLAY_NAME,
      role: "head_office_admin",
      branchId,
      passwordHash,
      isActive: true,
    })
    .returning();

  console.log(`Created demo user (id=${created.id})`);
  return created;
}

async function upsertExampleClients(branchId: number, assignedToId: number) {
  for (const example of EXAMPLE_CLIENTS) {
    const [existing] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(eq(clientsTable.externalUuid, example.externalUuid))
      .limit(1);

    const values = {
      ...example,
      branchId,
      assignedToId,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(clientsTable).set(values).where(eq(clientsTable.id, existing.id));
      console.log(`Updated example client ${example.fullName}`);
    } else {
      await db.insert(clientsTable).values(values);
      console.log(`Created example client ${example.fullName}`);
    }
  }
}

async function main() {
  const branch = await findOrCreateDemoBranch();
  const user = await findOrCreateDemoUser(branch.id);
  await upsertExampleClients(branch.id, user.id);

  console.log(`\nDemo branch: ${branch.name} (id=${branch.id})`);
  console.log("Anyone can log in with:");
  console.log(`  Telegram ID: ${TELEGRAM_ID}`);
  console.log(`  Password:    ${PASSWORD}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error("\nFailed:", err);
  try { await pool.end(); } catch {}
  process.exit(1);
});
