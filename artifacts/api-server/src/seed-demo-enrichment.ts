#!/usr/bin/env tsx
/**
 * Enrich the production demo data for buyer presentations.
 *
 * Idempotent. Safe to re-run.
 *
 *   - Inserts a new credit-policy version with plausible FAKE numbers so the
 *     real Ipak Yuli rates never appear in screenshots.
 *   - Tops up Articles + Recommendation Documents so those pages look alive.
 *   - Renames the literal "Minerva Demo Branch" to a realistic branch name.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... \
 *     pnpm --filter @workspace/api-server run seed:demo-enrichment
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  pool,
  activityLogTable,
  articlesTable,
  branchesTable,
  clientsTable,
  policyParamVersionsTable,
  recommendationDocumentsTable,
  usersTable,
} from "@workspace/db";

const DEMO_BRANCH_OLD_NAME = "Minerva Demo Branch";
const DEMO_BRANCH_NEW = { name: "00412 Чилонзор", city: "Toshkent" };

const FAKE_POLICY_VERSION = "2026.05-demo";
const FAKE_POLICY_VALUE = {
  minCoverageRatio: 1.3,
  collateralDiscounts: {
    governmentSecurities: 0.95,
    realEstate: 0.85,
    vehicles: 0.75,
    corporateSecurities: 0.7,
    inventoryCirculation: 0.65,
    equipment: 0.6,
  },
  transportAgeThresholdYears: 5,
  transportAgeDiscount: 0.5,
  dscrMax: 0.75,
  dscrMaxFx: 0.55,
  debtToEquityMax: 1.2,
  loanToWorkingCapitalMax: 0.65,
  minRatesUzs: {
    micro: { le12m: 0.21, gt12m: 0.23 },
    small: { le12m: 0.2, gt12m: 0.22 },
    medium: { any: 0.19 },
  },
  minRatesFx: { micro: 0.115, small: 0.105, medium: 0.095 },
  maxTermMonths: { workingCapital: 30, fixedAssets: 48 },
  graduatedLending: {
    loan1MaxMonths: 6,
    loan1MaxMonthsTrade: 3,
    loan2MaxMonths: 12,
    loan3MaxMonths: 18,
  },
  creditCommitteeLimitsUsd: {
    singleBorrower: 750000,
    relatedGroup: 3000000,
  },
  negativeIndustryKeywords: [
    "казино",
    "табак",
    "оружие",
    "азартные игры",
    "крепкий алкоголь",
    "меха",
    "спекуляция валютой",
    "добыча редких животных",
  ],
};

const DEMO_ARTICLES = [
  {
    title: "Запуск программы поддержки женщин-предпринимателей",
    category: "program",
    isPublished: true,
    content:
      "С 1 июня 2026 года банк запускает специальные условия по микрокредитам для женщин-предпринимателей: ставка от 19% годовых, упрощённый пакет документов, возможность отсрочки первого платежа на 60 дней. Программа действует во всех филиалах. Контактное лицо в каждом регионе — региональный менеджер по микро-сегменту.",
  },
  {
    title: "Обновлённые ставки на оборотный капитал — май 2026",
    category: "policy",
    isPublished: true,
    content:
      "Доведена новая сетка минимальных ставок для кредитов на пополнение оборотного капитала. Для микро-сегмента (до 12 мес.) — от 21% годовых; для small (свыше 12 мес.) — от 22% годовых. Полная сетка доступна в разделе «Кредитная политика». Действует с 5 мая 2026 года.",
  },
  {
    title: "График работы филиалов на Курбан-Хайит",
    category: "general",
    isPublished: true,
    content:
      "В период с 6 по 8 июня 2026 года филиалы работают по сокращённому графику: с 10:00 до 14:00. Обработка заявок, поданных через мини-приложение, продолжается в обычном режиме — ответственные менеджеры выходят на связь в течение одного рабочего дня после окончания праздников.",
  },
];

const DEMO_RECO_DOCS = [
  {
    title: "Транспорт старше 7 лет — оценка и дисконты",
    tags: "transport,>7y,discount",
    sortOrder: 10,
    body:
      "При оценке залогового транспорта старше 5 лет применяется повышенный дисконт 50% к рыночной стоимости. Возраст определяется от года выпуска до даты подачи заявки.\n\nРекомендации хантеру:\n- Запросить ПТС и фотофиксацию VIN.\n- Уточнить пробег и наличие сервисной истории.\n- При наличии нескольких ТС в залоге — оценивать каждое отдельно, минимальный коэф. покрытия (LTV) = 1.30.",
  },
  {
    title: "Залог по ювелирным изделиям: правила и лимиты",
    tags: "jewelry,collateral",
    sortOrder: 20,
    body:
      "Изделия из драгоценных металлов принимаются в залог при условии независимой оценки и страхования. Единый дисконт 30%. Не принимаются: изделия с большим количеством крупных вставок, изделия с пробой ниже 585, антиквариат без сертификата подлинности.",
  },
  {
    title: "DSCR при валютных кредитах — типичные ошибки",
    tags: "dscr,fx,risk",
    sortOrder: 30,
    body:
      "Для валютных кредитов лимит DSCR жёстче (0.55 против 0.75 для UZS). Часто хантеры забывают учесть валютный риск при расчёте будущих платежей. Используйте калькулятор с курсом +15% к текущему ЦБ — это снимает 80% вопросов кредитного комитета.",
  },
  {
    title: "Серия кредитов (graduated lending) — методичка",
    tags: "graduated,methodology",
    sortOrder: 40,
    body:
      "Программа поэтапного кредитования: первый кредит — до 6 месяцев (3 мес. для торговли), второй — до 12, третий — до 18. Каждый следующий выдаётся только при положительной кредитной истории по предыдущему. Это снижает риск дефолта и постепенно увеличивает лимит клиента.",
  },
];

async function getSomeAuthor(): Promise<number | null> {
  const [demoUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.telegramId, "demo"))
    .limit(1);
  return demoUser?.id ?? null;
}

async function renameDemoBranch() {
  const [existing] = await db
    .select()
    .from(branchesTable)
    .where(eq(branchesTable.name, DEMO_BRANCH_OLD_NAME))
    .limit(1);
  if (!existing) {
    console.log("- branch rename: skipped (no 'Minerva Demo Branch' row)");
    return;
  }
  await db
    .update(branchesTable)
    .set({ ...DEMO_BRANCH_NEW, updatedAt: new Date() })
    .where(eq(branchesTable.id, existing.id));
  console.log(`- branch renamed: id=${existing.id} -> "${DEMO_BRANCH_NEW.name}"`);
}

async function insertDemoPolicyVersion() {
  const [existing] = await db
    .select({ id: policyParamVersionsTable.id })
    .from(policyParamVersionsTable)
    .where(eq(policyParamVersionsTable.version, FAKE_POLICY_VERSION))
    .orderBy(desc(policyParamVersionsTable.id))
    .limit(1);

  if (existing) {
    await db
      .update(policyParamVersionsTable)
      .set({ value: FAKE_POLICY_VALUE, effectiveFrom: new Date() })
      .where(eq(policyParamVersionsTable.id, existing.id));
    console.log(`- policy: updated existing demo version (id=${existing.id})`);
    return;
  }

  const author = await getSomeAuthor();
  const [created] = await db
    .insert(policyParamVersionsTable)
    .values({
      version: FAKE_POLICY_VERSION,
      effectiveFrom: new Date(),
      effectiveTo: null,
      value: FAKE_POLICY_VALUE,
      createdBy: author,
    })
    .returning({ id: policyParamVersionsTable.id });
  console.log(`- policy: inserted demo version (id=${created.id})`);
}

async function upsertArticles() {
  const author = await getSomeAuthor();
  for (const article of DEMO_ARTICLES) {
    const [existing] = await db
      .select({ id: articlesTable.id })
      .from(articlesTable)
      .where(eq(articlesTable.title, article.title))
      .limit(1);
    if (existing) {
      await db
        .update(articlesTable)
        .set({
          content: article.content,
          category: article.category,
          isPublished: article.isPublished,
          targetAllBranches: true,
          updatedAt: new Date(),
        })
        .where(eq(articlesTable.id, existing.id));
      console.log(`- article updated: "${article.title}"`);
    } else {
      await db.insert(articlesTable).values({
        title: article.title,
        content: article.content,
        category: article.category,
        isPublished: article.isPublished,
        targetAllBranches: true,
        authorId: author,
      });
      console.log(`- article inserted: "${article.title}"`);
    }
  }
}

async function upsertRecommendationDocs() {
  const author = await getSomeAuthor();
  for (const doc of DEMO_RECO_DOCS) {
    const [existing] = await db
      .select({ id: recommendationDocumentsTable.id })
      .from(recommendationDocumentsTable)
      .where(eq(recommendationDocumentsTable.title, doc.title))
      .limit(1);
    if (existing) {
      await db
        .update(recommendationDocumentsTable)
        .set({
          body: doc.body,
          tags: doc.tags,
          sortOrder: doc.sortOrder,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(recommendationDocumentsTable.id, existing.id));
      console.log(`- reco-doc updated: "${doc.title}"`);
    } else {
      await db.insert(recommendationDocumentsTable).values({
        title: doc.title,
        body: doc.body,
        tags: doc.tags,
        sortOrder: doc.sortOrder,
        isActive: true,
        authorId: author,
      });
      console.log(`- reco-doc inserted: "${doc.title}"`);
    }
  }
  // suppress unused-import warning for `and`
  void and;
}

const REALISTIC_CLIENTS: Array<{
  fullName: string;
  legalName?: string;
  phone: string;
  status:
    | "draft"
    | "lead"
    | "recommendation"
    | "basket"
    | "pdf_generated"
    | "completed";
  clientType: "individual" | "corporate";
  branchOffset: number;
  purpose?: string;
  desiredAmountUzs?: string;
  desiredTermMonths?: number;
  preferredCurrency?: string;
  preferredLanguage?: string;
}> = [
  { fullName: "Акбаров Шерзод", phone: "+998901112201", status: "lead", clientType: "individual", branchOffset: 0, purpose: "Расширение точки общественного питания", desiredAmountUzs: "180000000.00", desiredTermMonths: 18, preferredCurrency: "UZS", preferredLanguage: "ru" },
  { fullName: "Юсупова Мадина", phone: "+998901112202", status: "recommendation", clientType: "individual", branchOffset: 1, purpose: "Закупка швейного оборудования", desiredAmountUzs: "320000000.00", desiredTermMonths: 36, preferredCurrency: "UZS", preferredLanguage: "ru" },
  { fullName: "Алиев Дониёр", legalName: "ООО Tashkent Textile Group", phone: "+998712001122", status: "pdf_generated", clientType: "corporate", branchOffset: 2, purpose: "Пополнение оборотного капитала", desiredAmountUzs: "850000000.00", desiredTermMonths: 24, preferredCurrency: "UZS", preferredLanguage: "ru" },
  { fullName: "Каримов Баходир", phone: "+998931112203", status: "basket", clientType: "individual", branchOffset: 3, purpose: "Покупка коммерческой недвижимости", desiredAmountUzs: "420000000.00", desiredTermMonths: 60, preferredCurrency: "UZS", preferredLanguage: "ru" },
  { fullName: "Эргашева Мадина", legalName: "ООО Samarkand Logistics", phone: "+998901112204", status: "completed", clientType: "corporate", branchOffset: 4, purpose: "Лизинг грузового транспорта", desiredAmountUzs: "560000000.00", desiredTermMonths: 36, preferredCurrency: "UZS", preferredLanguage: "ru" },
  { fullName: "Назаров Сардор", phone: "+998901112205", status: "draft", clientType: "individual", branchOffset: 0, purpose: "Запуск кофейни", desiredAmountUzs: "150000000.00", desiredTermMonths: 24, preferredCurrency: "UZS", preferredLanguage: "ru" },
  { fullName: "Мирзаев Улуғбек", phone: "+998991112206", status: "recommendation", clientType: "individual", branchOffset: 1, purpose: "Развитие тепличного хозяйства", desiredAmountUzs: "240000000.00", desiredTermMonths: 36, preferredCurrency: "UZS", preferredLanguage: "uz" },
  { fullName: "Юсупов Жасур", legalName: "ООО Fergana Agro", phone: "+998732001122", status: "pdf_generated", clientType: "corporate", branchOffset: 2, purpose: "Закупка зерноуборочной техники", desiredAmountUzs: "720000000.00", desiredTermMonths: 48, preferredCurrency: "UZS", preferredLanguage: "uz" },
  { fullName: "Юлдашев Алишер", phone: "+998931112207", status: "basket", clientType: "individual", branchOffset: 3, purpose: "Открытие второй точки магазина", desiredAmountUzs: "190000000.00", desiredTermMonths: 24, preferredCurrency: "UZS", preferredLanguage: "ru" },
  { fullName: "Ходжаев Дилшод", legalName: "ООО Navoi Construction", phone: "+998792001122", status: "completed", clientType: "corporate", branchOffset: 4, purpose: "Строительство торгового центра", desiredAmountUzs: "1200000000.00", desiredTermMonths: 60, preferredCurrency: "UZS", preferredLanguage: "ru" },
  { fullName: "Махмудов Равшан", phone: "+998991112208", status: "lead", clientType: "individual", branchOffset: 0, purpose: "Покупка автомобиля для такси-парка", desiredAmountUzs: "210000000.00", desiredTermMonths: 30, preferredCurrency: "UZS", preferredLanguage: "ru" },
  { fullName: "Юлдашева Дилфуза", legalName: "ООО Bukhara Trade House", phone: "+998652001122", status: "recommendation", clientType: "corporate", branchOffset: 1, purpose: "Развитие импортной логистики", desiredAmountUzs: "640000000.00", desiredTermMonths: 36, preferredCurrency: "USD", preferredLanguage: "ru" },
  { fullName: "Каримова Зарина", phone: "+998901112209", status: "draft", clientType: "individual", branchOffset: 2, purpose: "Запуск онлайн-магазина", desiredAmountUzs: "95000000.00", desiredTermMonths: 18, preferredCurrency: "UZS", preferredLanguage: "ru" },
  { fullName: "Турсунов Ботир", legalName: "ООО Andijon Foods", phone: "+998742001122", status: "pdf_generated", clientType: "corporate", branchOffset: 3, purpose: "Модернизация консервного цеха", desiredAmountUzs: "880000000.00", desiredTermMonths: 48, preferredCurrency: "UZS", preferredLanguage: "ru" },
  { fullName: "Каримов Жасур", phone: "+998901112210", status: "basket", clientType: "individual", branchOffset: 4, purpose: "Покупка торгового павильона", desiredAmountUzs: "160000000.00", desiredTermMonths: 24, preferredCurrency: "UZS", preferredLanguage: "uz" },
  { fullName: "Хайдаров Тимур", legalName: "ООО Khorezm Textile", phone: "+998622001122", status: "completed", clientType: "corporate", branchOffset: 0, purpose: "Модернизация швейного производства", desiredAmountUzs: "750000000.00", desiredTermMonths: 36, preferredCurrency: "UZS", preferredLanguage: "ru" },
  { fullName: "Тошкенбаев Азиз", phone: "+998901112211", status: "recommendation", clientType: "individual", branchOffset: 1, purpose: "Запуск автомойки", desiredAmountUzs: "110000000.00", desiredTermMonths: 18, preferredCurrency: "UZS", preferredLanguage: "ru" },
  { fullName: "Расулов Бекзод", legalName: "ООО Surxon Energy", phone: "+998752001122", status: "pdf_generated", clientType: "corporate", branchOffset: 2, purpose: "Установка солнечных панелей на складе", desiredAmountUzs: "540000000.00", desiredTermMonths: 36, preferredCurrency: "USD", preferredLanguage: "ru" },
  { fullName: "Толибов Жасур", phone: "+998901112212", status: "draft", clientType: "individual", branchOffset: 3, purpose: "Закупка мебели для мастерской", desiredAmountUzs: "85000000.00", desiredTermMonths: 12, preferredCurrency: "UZS", preferredLanguage: "ru" },
  { fullName: "Хамраев Алишер", legalName: "ООО Central Asia Trading", phone: "+998712001133", status: "basket", clientType: "corporate", branchOffset: 4, purpose: "Расширение импорта строительных материалов", desiredAmountUzs: "920000000.00", desiredTermMonths: 36, preferredCurrency: "USD", preferredLanguage: "ru" },
  { fullName: "Қодирова Ситора", phone: "+998931112213", status: "lead", clientType: "individual", branchOffset: 0, purpose: "Развитие салона красоты", desiredAmountUzs: "140000000.00", desiredTermMonths: 24, preferredCurrency: "UZS", preferredLanguage: "uz" },
];

async function refreshDemoClients() {
  // Get a list of real-looking branches (NOT the demo branch 22) to spread
  // the clients across. We only touch IDs 33..53 which the audit confirmed
  // are test garbage. IDs 54 + 55 (the seeded Akmal / Dilnoza) stay untouched.
  const branches = await db
    .select({ id: branchesTable.id, name: branchesTable.name })
    .from(branchesTable)
    .where(sql`${branchesTable.name} <> ${"00412 Чилонзор"}`)
    .orderBy(branchesTable.id);

  if (branches.length === 0) {
    console.log("- clients: skipped (no non-demo branches found)");
    return;
  }

  const targetIds = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(sql`${clientsTable.id} BETWEEN 33 AND 53`)
    .orderBy(clientsTable.id);

  if (targetIds.length === 0) {
    console.log("- clients: skipped (no junk rows 33-53 found)");
    return;
  }

  for (let i = 0; i < targetIds.length; i++) {
    const id = targetIds[i].id;
    const tmpl = REALISTIC_CLIENTS[i % REALISTIC_CLIENTS.length];
    const branchId = branches[tmpl.branchOffset % branches.length].id;

    await db
      .update(clientsTable)
      .set({
        fullName: tmpl.fullName,
        legalName: tmpl.legalName ?? null,
        phone: tmpl.phone,
        status: tmpl.status,
        clientType: tmpl.clientType,
        branchId,
        purpose: tmpl.purpose ?? null,
        desiredAmountUzs: tmpl.desiredAmountUzs ?? null,
        desiredTermMonths: tmpl.desiredTermMonths ?? null,
        preferredCurrency: tmpl.preferredCurrency ?? "UZS",
        preferredLanguage: tmpl.preferredLanguage ?? "ru",
        updatedAt: new Date(),
      })
      .where(eq(clientsTable.id, id));
  }
  console.log(`- clients: refreshed ${targetIds.length} junk rows with realistic data`);
}

async function fixArticleCategoriesAndAuthors() {
  // The 3 demo articles inserted earlier use categories "program" / "policy"
  // which have no i18n labels — they render as raw keys on the cards.
  // Collapse to "general" (always translated) and re-attribute to a real
  // editor so the "Автор: ..." line reads professionally.
  const realEditor = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(sql`${usersTable.telegramId} <> ${"demo"}`, eq(usersTable.role, "head_office_admin")))
    .orderBy(usersTable.id)
    .limit(1);

  const editorId = realEditor[0]?.id ?? null;
  await db
    .update(articlesTable)
    .set({
      category: "general",
      ...(editorId ? { authorId: editorId } : {}),
      updatedAt: new Date(),
    })
    .where(inArray(articlesTable.category, ["program", "policy"]));
  console.log(`- articles: collapsed off-list categories to 'general'${editorId ? ` and reassigned author to user #${editorId}` : ""}`);
}

const DEMO_ACTIVITY_EVENTS = [
  { type: "client_created", description: "Создан клиент Каримов Баходир", entityType: "client", userName: "Minerva Guest Viewer", branchName: "00412 Чилонзор", hoursAgo: 2 },
  { type: "client_created", description: "Создан клиент Юсупова Мадина", entityType: "client", userName: "Minerva Guest Viewer", branchName: "00412 Чилонзор", hoursAgo: 5 },
  { type: "recommendation_generated", description: "Сформировано КП по клиенту Алиев Дониёр", entityType: "client", userName: "Minerva Guest Viewer", branchName: "Головной офис", hoursAgo: 9 },
  { type: "pdf_generated", description: "Сгенерирован PDF для клиента Эргашева Мадина", entityType: "client", userName: "Minerva Guest Viewer", branchName: "00412 Чилонзор", hoursAgo: 22 },
  { type: "article_published", description: "Опубликована статья «Запуск программы поддержки женщин-предпринимателей»", entityType: "article", userName: "Абдигаффаров Нажмиддин", branchName: "Головной офис", hoursAgo: 30 },
  { type: "user_created", description: "Добавлен новый пользователь Хамраев Алишер", entityType: "user", userName: "Корабаев Темур Тулегенович", branchName: "Головной офис", hoursAgo: 50 },
];

async function refreshActivityLog() {
  // Wipe the "branch_deleted" pile that dominates the top-event KPI for buyer
  // demos, then seed a handful of friendlier events so the dashboard breathes.
  await db.delete(activityLogTable).where(eq(activityLogTable.type, "branch_deleted"));
  for (const ev of DEMO_ACTIVITY_EVENTS) {
    const createdAt = new Date(Date.now() - ev.hoursAgo * 60 * 60 * 1000);
    await db.insert(activityLogTable).values({
      type: ev.type,
      description: ev.description,
      entityType: ev.entityType,
      userName: ev.userName,
      branchName: ev.branchName,
      createdAt,
    });
  }
  console.log(`- activity log: removed branch_deleted rows, inserted ${DEMO_ACTIVITY_EVENTS.length} friendly events`);
}

async function main() {
  console.log("Enriching demo data...\n");
  await renameDemoBranch();
  await insertDemoPolicyVersion();
  await upsertArticles();
  await fixArticleCategoriesAndAuthors();
  await upsertRecommendationDocs();
  await refreshDemoClients();
  await refreshActivityLog();
  console.log("\nDone.");
  await pool.end();
}

main().catch(async (err) => {
  console.error("\nFailed:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
