import { db } from "@workspace/db";
import {
  branchesTable, usersTable, productCategoriesTable, productsTable,
  clientsTable, articlesTable, articleVisibilityTable, activityLogTable
} from "@workspace/db";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { logger } from "./lib/logger";

export async function seedDatabase() {
  const [existing] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
  if (existing && existing.count > 0) {
    logger.info("Database already seeded, skipping");
    return;
  }

  logger.info("Seeding database with demo data...");

  const passwordHash = await bcrypt.hash("password", 10);

  const branches = await db.insert(branchesTable).values([
    { name: "Головной офис", city: "Алматы", isActive: true },
    { name: "Филиал Астана", city: "Астана", isActive: true },
    { name: "Филиал Шымкент", city: "Шымкент", isActive: true },
  ]).returning();

  const users = await db.insert(usersTable).values([
    { telegramId: "100000001", name: "Алибек Джаксыбеков", role: "superadmin", branchId: null, passwordHash, isActive: true },
    { telegramId: "100000002", name: "Дана Сейтова", role: "head_office_admin", branchId: branches[0].id, passwordHash, isActive: true },
    { telegramId: "100000003", name: "Руслан Берекетов", role: "branch_head", branchId: branches[1].id, passwordHash, isActive: true },
    { telegramId: "100000004", name: "Айгерим Нурланова", role: "hunter", branchId: branches[1].id, passwordHash, isActive: true },
    { telegramId: "100000005", name: "Тимур Абдрахманов", role: "hunter", branchId: branches[1].id, passwordHash, isActive: true },
    { telegramId: "100000006", name: "Сауле Мухамедова", role: "branch_head", branchId: branches[2].id, passwordHash, isActive: true },
    { telegramId: "100000007", name: "Карим Исмаилов", role: "hunter", branchId: branches[2].id, passwordHash, isActive: true },
    { telegramId: "100000008", name: "Зарина Омарова", role: "editor", branchId: branches[0].id, passwordHash, isActive: true },
  ]).returning();

  const cats = await db.insert(productCategoriesTable).values([
    { name: "Кредиты для бизнеса", description: "Кредитные продукты для МСБ" },
    { name: "Залоговые продукты", description: "Продукты с обеспечением" },
    { name: "Некредитные услуги", description: "Дополнительные финансовые услуги" },
  ]).returning();

  await db.insert(productsTable).values([
    { name: "Бизнес Кредит Стандарт", type: "credit", categoryId: cats[0].id, description: "Универсальный кредит для развития бизнеса", minAmount: "500000", maxAmount: "50000000", minTermMonths: 6, maxTermMonths: 60, interestRate: "18.5", isActive: true },
    { name: "Экспресс Кредит", type: "credit", categoryId: cats[0].id, description: "Быстрое финансирование без залога", minAmount: "100000", maxAmount: "5000000", minTermMonths: 3, maxTermMonths: 24, interestRate: "24.0", isActive: true },
    { name: "Залоговый Кредит Про", type: "credit", categoryId: cats[1].id, description: "Кредит под залог недвижимости", minAmount: "1000000", maxAmount: "200000000", minTermMonths: 12, maxTermMonths: 120, interestRate: "14.5", isActive: true },
    { name: "Кредит под авто", type: "credit", categoryId: cats[1].id, description: "Автомобиль в качестве залога", minAmount: "500000", maxAmount: "30000000", minTermMonths: 6, maxTermMonths: 84, interestRate: "16.0", isActive: true },
    { name: "РКО Бизнес", type: "non_credit", categoryId: cats[2].id, description: "Расчетно-кассовое обслуживание", isActive: true },
    { name: "Эквайринг", type: "non_credit", categoryId: cats[2].id, description: "Прием платежей по картам", isActive: true },
  ]);

  await db.insert(clientsTable).values([
    { sessionId: randomUUID(), fullName: "Бауыржан Қасымов", phone: "+7 701 234 5678", status: "completed", branchId: branches[1].id, assignedToId: users[3].id },
    { sessionId: randomUUID(), fullName: "Гульнара Сапарова", phone: "+7 702 345 6789", status: "questionnaire", branchId: branches[1].id, assignedToId: users[3].id },
    { sessionId: randomUUID(), fullName: "Ержан Абенов", phone: "+7 707 456 7890", status: "basket", branchId: branches[2].id, assignedToId: users[6].id },
    { sessionId: randomUUID(), fullName: "Асель Жаксыбекова", phone: "+7 705 567 8901", status: "recommendation", branchId: branches[1].id, assignedToId: users[4].id },
    { sessionId: randomUUID(), fullName: "Марат Дюсенов", phone: "+7 701 678 9012", status: "completed", branchId: branches[2].id, assignedToId: users[6].id },
    { sessionId: randomUUID(), fullName: "Нургуль Ахметова", phone: "+7 702 789 0123", status: "draft", branchId: branches[1].id, assignedToId: users[4].id },
    { sessionId: randomUUID(), fullName: "Серик Бейсенов", phone: "+7 707 890 1234", status: "rejected", branchId: branches[2].id, assignedToId: users[6].id },
    { sessionId: randomUUID(), fullName: "Айдана Муратова", phone: "+7 705 901 2345", status: "pdf_generated", branchId: branches[1].id, assignedToId: users[3].id },
  ]);

  await db.insert(articlesTable).values([
    { title: "Требования к кредитному досье", content: "Перечень документов для оформления кредита:\n1. Удостоверение личности\n2. Свидетельство о регистрации ИП/ТОО\n3. Финансовая отчетность за последние 2 года\n4. Справка об отсутствии задолженностей", isPublished: true, targetAllBranches: true, authorId: users[1].id },
    { title: "Методология оценки залога", content: "Оценка залогового имущества проводится по следующим критериям:\n- Ликвидность объекта\n- Рыночная стоимость\n- Юридическая чистота\n- Физическое состояние", isPublished: true, targetAllBranches: true, authorId: users[1].id },
    { title: "Акция: сниженные ставки в Q2 2026", content: "С 1 апреля по 30 июня 2026 года действуют специальные условия по продукту Бизнес Кредит Стандарт. Ставка снижена до 16% годовых для новых клиентов.", isPublished: true, targetAllBranches: false, authorId: users[7].id },
  ]);

  await db.insert(activityLogTable).values([
    { type: "client_completed", description: "Клиент Бауыржан Қасымов успешно завершил кредитную заявку", entityId: 1, entityType: "client", userId: users[3].id, userName: users[3].name, branchName: branches[1].name },
    { type: "client_created", description: "Новый клиент добавлен в систему", entityId: 2, entityType: "client", userId: users[3].id, userName: users[3].name, branchName: branches[1].name },
    { type: "user_created", description: "Новый пользователь зарегистрирован", entityId: users[6].id, entityType: "user", userId: users[1].id, userName: users[1].name, branchName: branches[0].name },
    { type: "product_updated", description: "Продукт Экспресс Кредит обновлен", entityId: 2, entityType: "product", userId: users[1].id, userName: users[1].name, branchName: branches[0].name },
    { type: "client_rejected", description: "Заявка клиента Серик Бейсенов отклонена", entityId: 7, entityType: "client", userId: users[6].id, userName: users[6].name, branchName: branches[2].name },
    { type: "article_published", description: "Статья Требования к кредитному досье опубликована", entityId: 1, entityType: "article", userId: users[7].id, userName: users[7].name, branchName: branches[0].name },
  ]);

  logger.info("Database seeded successfully");
}
