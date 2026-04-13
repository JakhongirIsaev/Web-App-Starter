import { db } from "@workspace/db";
import {
  activityLogTable,
  articleVisibilityTable,
  articlesTable,
  branchesTable,
  clientsTable,
  productCategoriesTable,
  productsTable,
  usersTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { logger } from "./lib/logger";

interface SeedOptions {
  force?: boolean;
}

async function truncateDemoTables() {
  await db.execute(sql`
    TRUNCATE TABLE
      activity_log,
      article_visibility,
      articles,
      client_documents,
      calculations,
      basket_items,
      baskets,
      questionnaire_answers,
      questionnaire_sessions,
      client_next_actions,
      client_notes,
      clients,
      products,
      product_categories,
      users,
      branches
    RESTART IDENTITY CASCADE
  `);
}

export async function seedDatabase(options: SeedOptions = {}) {
  const { force = false } = options;
  const [existing] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);

  if (existing && existing.count > 0 && !force) {
    logger.info("Database already seeded, skipping");
    return;
  }

  if (force) {
    logger.info("Force reseed requested, clearing demo data");
    await truncateDemoTables();
  }

  logger.info("Seeding database with Uzbek demo data...");

  const passwordHash = await bcrypt.hash("password", 10);

  const branches = await db.insert(branchesTable).values([
    { name: "Bosh ofis", city: "Toshkent", isActive: true },
    { name: "Yunusobod filiali", city: "Toshkent", isActive: true },
    { name: "Samarqand filiali", city: "Samarqand", isActive: true },
    { name: "Andijon filiali", city: "Andijon", isActive: true },
  ]).returning();

  const users = await db.insert(usersTable).values([
    { telegramId: "399083740", name: "Jakhongir Isaev", role: "superadmin", branchId: null, passwordHash, isActive: true },
    { telegramId: "10000001", name: "Minerva Demo Admin", role: "superadmin", branchId: null, passwordHash, isActive: true },
    { telegramId: "100000001", name: "Nodira Karimova", role: "head_office_admin", branchId: branches[0].id, passwordHash, isActive: true },
    { telegramId: "100000002", name: "Dilshod Rasulov", role: "branch_head", branchId: branches[1].id, passwordHash, isActive: true },
    { telegramId: "100000003", name: "Madina Tursunova", role: "hunter", branchId: branches[1].id, passwordHash, isActive: true },
    { telegramId: "100000004", name: "Bekzod Yuldashev", role: "hunter", branchId: branches[1].id, passwordHash, isActive: true },
    { telegramId: "100000005", name: "Shahnoza Ergasheva", role: "branch_head", branchId: branches[2].id, passwordHash, isActive: true },
    { telegramId: "100000006", name: "Ulugbek Axmedov", role: "hunter", branchId: branches[2].id, passwordHash, isActive: true },
    { telegramId: "100000007", name: "Sevara Ibrohimova", role: "editor", branchId: branches[0].id, passwordHash, isActive: true },
  ]).returning();

  const categories = await db.insert(productCategoriesTable).values([
    { name: "Biznes kreditlari", description: "Kichik va o'rta biznes uchun kredit mahsulotlari" },
    { name: "Garovli mahsulotlar", description: "Ta'minot bilan beriladigan mahsulotlar" },
    { name: "Nokredit xizmatlari", description: "Qo'shimcha bank xizmatlari va paketlar" },
  ]).returning();

  await db.insert(productsTable).values([
    {
      name: "Ishonch Biznes",
      type: "credit",
      categoryId: categories[0].id,
      description: "Aylanma mablag'ni to'ldirish va savdo operatsiyalarini moliyalashtirish uchun kredit.",
      minAmount: "50000000",
      maxAmount: "3000000000",
      minTermMonths: 6,
      maxTermMonths: 36,
      interestRate: "23.50",
      isActive: true,
    },
    {
      name: "Biznes Express",
      type: "credit",
      categoryId: categories[0].id,
      description: "Tezkor ko'rib chiqiladigan qisqa muddatli kredit.",
      minAmount: "30000000",
      maxAmount: "800000000",
      minTermMonths: 3,
      maxTermMonths: 24,
      interestRate: "26.00",
      isActive: true,
    },
    {
      name: "Taraqqiyot Invest",
      type: "credit",
      categoryId: categories[1].id,
      description: "Asosiy vositalarni yangilash va uskunalar xaridi uchun uzoq muddatli kredit.",
      minAmount: "150000000",
      maxAmount: "5000000000",
      minTermMonths: 12,
      maxTermMonths: 84,
      interestRate: "21.00",
      isActive: true,
    },
    {
      name: "Savdo Hisobi Plus",
      type: "non_credit",
      categoryId: categories[2].id,
      description: "Hisob-kitob xizmati, to'lovlar va ekvayringni birlashtirgan paket.",
      isActive: true,
    },
    {
      name: "Smart Terminal",
      type: "non_credit",
      categoryId: categories[2].id,
      description: "POS terminal va elektron to'lovlarni qabul qilish xizmati.",
      isActive: true,
    },
  ]);

  const clients = await db.insert(clientsTable).values([
    { sessionId: randomUUID(), fullName: "Azizbek Raximov", phone: "+998901112233", status: "completed", branchId: branches[1].id, assignedToId: users[4].id },
    { sessionId: randomUUID(), fullName: "Gulnoza Sobirova", phone: "+998933334455", status: "questionnaire", branchId: branches[1].id, assignedToId: users[4].id },
    { sessionId: randomUUID(), fullName: "Jasur Xolmatov", phone: "+998998887766", status: "basket", branchId: branches[2].id, assignedToId: users[7].id },
    { sessionId: randomUUID(), fullName: "Dildora Erkinova", phone: "+998971234567", status: "recommendation", branchId: branches[1].id, assignedToId: users[5].id },
    { sessionId: randomUUID(), fullName: "Rustam Jo'rayev", phone: "+998909876543", status: "completed", branchId: branches[2].id, assignedToId: users[7].id },
    { sessionId: randomUUID(), fullName: "Malika Yusupova", phone: "+998945551122", status: "draft", branchId: branches[1].id, assignedToId: users[5].id },
    { sessionId: randomUUID(), fullName: "Temurbek Xasanov", phone: "+998998001122", status: "rejected", branchId: branches[3].id, assignedToId: users[7].id },
    { sessionId: randomUUID(), fullName: "Shaxzoda Islomova", phone: "+998977778899", status: "pdf_generated", branchId: branches[1].id, assignedToId: users[4].id },
  ]).returning();

  const articles = await db.insert(articlesTable).values([
    {
      title: "Kredit dosyesi uchun majburiy hujjatlar",
      content: "Kredit arizasini to'liq ko'rib chiqish uchun STIR, guvohnoma, oxirgi moliyaviy hisobot va aylanma haqida ma'lumot talab qilinadi.",
      category: "documents",
      isPublished: true,
      targetAllBranches: true,
      authorId: users[2].id,
    },
    {
      title: "Mijoz bilan birinchi uchrashuv ssenariysi",
      content: "Birinci uchrashuvda biznes yo'nalishi, mijoz oqimi, oylik tushum, garov bazasi va kerakli moliyalashtirish maqsadini aniqlang.",
      category: "onboarding",
      isPublished: true,
      targetAllBranches: true,
      authorId: users[8].id,
    },
    {
      title: "Samarqand va Andijon filiallari uchun aprel aksiyasi",
      content: "Aprel oyida ishlab chiqarish va qayta ishlash loyihalari uchun komissiya bo'yicha yengilliklar qo'llanadi.",
      category: "general",
      isPublished: true,
      targetAllBranches: false,
      authorId: users[2].id,
    },
  ]).returning();

  await db.insert(articleVisibilityTable).values([
    { articleId: articles[2].id, branchId: branches[2].id },
    { articleId: articles[2].id, branchId: branches[3].id },
  ]);

  await db.insert(activityLogTable).values([
    {
      type: "client_completed",
      description: "Azizbek Raximov bo'yicha kredit jarayoni muvaffaqiyatli yakunlandi.",
      entityId: clients[0].id,
      entityType: "client",
      userId: users[4].id,
      userName: users[4].name,
      branchName: branches[1].name,
    },
    {
      type: "client_created",
      description: "Gulnoza Sobirova bo'yicha yangi mijoz kartasi yaratildi.",
      entityId: clients[1].id,
      entityType: "client",
      userId: users[4].id,
      userName: users[4].name,
      branchName: branches[1].name,
    },
    {
      type: "product_updated",
      description: "Biznes kreditlari bo'yicha ichki tavsiflar yangilandi.",
      entityId: categories[0].id,
      entityType: "product_category",
      userId: users[2].id,
      userName: users[2].name,
      branchName: branches[0].name,
    },
    {
      type: "article_published",
      description: "Mijoz bilan birinchi uchrashuv ssenariysi maqolasi nashr qilindi.",
      entityId: articles[1].id,
      entityType: "article",
      userId: users[8].id,
      userName: users[8].name,
      branchName: branches[0].name,
    },
    {
      type: "client_rejected",
      description: "Temurbek Xasanov bo'yicha ariza qayta ko'rib chiqish uchun rad etildi.",
      entityId: clients[6].id,
      entityType: "client",
      userId: users[7].id,
      userName: users[7].name,
      branchName: branches[2].name,
    },
  ]);

  logger.info("Database seeded successfully");
}
