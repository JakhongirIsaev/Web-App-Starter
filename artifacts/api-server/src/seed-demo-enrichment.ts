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
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  pool,
  articlesTable,
  branchesTable,
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

async function main() {
  console.log("Enriching demo data...\n");
  await renameDemoBranch();
  await insertDemoPolicyVersion();
  await upsertArticles();
  await upsertRecommendationDocs();
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
