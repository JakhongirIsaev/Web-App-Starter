import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  collateralEstimateItemsTable,
  collateralEstimatesTable,
  collateralItemsTable,
  collateralTypesTable,
  creditProductsTable,
} from "@workspace/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  CreateCollateralEstimateBody,
  CreateCollateralItemBody,
  UpdateCollateralItemBody,
  UpdateCollateralSettingsBody,
  UpdateCollateralTypeBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  requireClientAccess,
  requireCollateralEstimateAccess,
  requireCollateralItemAccess,
} from "../lib/client-access";
import { logActivity } from "../middleware/activity";
import {
  calculateAcceptedValue,
  calculateEstimateTotals,
  extractAnnualRate,
  isEquipmentOnly,
} from "../lib/collateral-calc";
import { getCollateralSettings, setCollateralSettings } from "../lib/system-settings";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const DISCLAIMER_RU =
  "Расчёт предварительный и не является официальной оценкой залога или решением банка.";

const ADMIN_ROLES = ["superadmin", "head_office_admin"] as const;

// ─── Collateral types ───────────────────────────────────────────────────────

router.get("/collateral-types", requireAuth, async (_req, res) => {
  const rows = await db
    .select()
    .from(collateralTypesTable)
    .where(eq(collateralTypesTable.isActive, true))
    .orderBy(asc(collateralTypesTable.sortOrder), asc(collateralTypesTable.id));
  res.json(rows);
});

router.patch(
  "/admin/collateral-types/:id",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Некорректный идентификатор" });
      return;
    }
    const parsed = UpdateCollateralTypeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректные данные", details: parsed.error.issues });
      return;
    }

    const [existing] = await db
      .select()
      .from(collateralTypesTable)
      .where(eq(collateralTypesTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Тип залога не найден" });
      return;
    }

    const [updated] = await db
      .update(collateralTypesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(collateralTypesTable.id, id))
      .returning();

    await logActivity({
      type: "collateral_type_updated",
      description: `Updated collateral type "${updated.code}"`,
      entityId: updated.id,
      entityType: "collateral_type",
      user: req.user,
      metadata: { before: existing, after: updated },
    });

    res.json(updated);
  },
);

// ─── System settings ────────────────────────────────────────────────────────

router.get(
  "/admin/collateral-settings",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  async (_req, res) => {
    const settings = await getCollateralSettings();
    res.json(settings);
  },
);

router.put(
  "/admin/collateral-settings",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    const parsed = UpdateCollateralSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректные данные", details: parsed.error.issues });
      return;
    }
    const before = await getCollateralSettings();
    await setCollateralSettings(parsed.data, req.user?.id ?? null);
    const after = await getCollateralSettings();

    await logActivity({
      type: "collateral_settings_updated",
      description: "Collateral system settings updated",
      user: req.user,
      metadata: { before, after },
    });

    res.json(after);
  },
);

// ─── Client collateral items ────────────────────────────────────────────────

router.get(
  "/clients/:id/collateral-items",
  requireAuth,
  requireClientAccess,
  async (req, res) => {
    const clientId = Number(req.params.id);
    const items = await db
      .select()
      .from(collateralItemsTable)
      .where(
        and(
          eq(collateralItemsTable.clientId, clientId),
          eq(collateralItemsTable.isActive, true),
        ),
      )
      .orderBy(desc(collateralItemsTable.createdAt));
    res.json(items);
  },
);

router.post(
  "/clients/:id/collateral-items",
  requireAuth,
  requireClientAccess,
  async (req, res) => {
    const clientId = Number(req.params.id);
    const parsed = CreateCollateralItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректные данные", details: parsed.error.issues });
      return;
    }
    if (parsed.data.isThirdParty && !parsed.data.thirdPartyOwnerName) {
      res.status(400).json({ error: "Для залога третьего лица укажите имя владельца" });
      return;
    }

    const [type] = await db
      .select()
      .from(collateralTypesTable)
      .where(
        and(
          eq(collateralTypesTable.id, parsed.data.collateralTypeId),
          eq(collateralTypesTable.isActive, true),
        ),
      )
      .limit(1);
    if (!type) {
      res.status(400).json({ error: "Тип залога не найден или отключён" });
      return;
    }

    const settings = await getCollateralSettings();
    const accepted = calculateAcceptedValue({
      typeCode: type.code,
      marketValue: parsed.data.marketValue,
      metadata: parsed.data.metadata ?? null,
      settings,
    });

    const [item] = await db
      .insert(collateralItemsTable)
      .values({
        clientId,
        collateralTypeId: type.id,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        marketValue: String(parsed.data.marketValue),
        acceptedValue: String(accepted.acceptedValue),
        discountApplied: accepted.discountApplied !== null ? String(accepted.discountApplied) : null,
        discountReason: accepted.discountReason,
        currency: parsed.data.currency ?? "UZS",
        isThirdParty: parsed.data.isThirdParty ?? false,
        thirdPartyOwnerName: parsed.data.thirdPartyOwnerName ?? null,
        metadata: parsed.data.metadata ?? {},
        createdBy: req.user?.id ?? null,
        updatedBy: req.user?.id ?? null,
      })
      .returning();

    await logActivity({
      type: "collateral_item_created",
      description: `Collateral item "${item.title}" created for client ${clientId}`,
      entityId: item.id,
      entityType: "collateral_item",
      user: req.user,
      metadata: {
        clientId,
        typeCode: type.code,
        marketValue: parsed.data.marketValue,
        acceptedValue: accepted.acceptedValue,
        discountApplied: accepted.discountApplied,
      },
    });

    res.status(201).json(item);
  },
);

router.patch(
  "/collateral-items/:id",
  requireAuth,
  requireCollateralItemAccess,
  async (req, res) => {
    const id = Number(req.params.id);
    const parsed = UpdateCollateralItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректные данные", details: parsed.error.issues });
      return;
    }
    if (parsed.data.isThirdParty === true && !parsed.data.thirdPartyOwnerName) {
      res.status(400).json({ error: "Для залога третьего лица укажите имя владельца" });
      return;
    }

    const [existing] = await db
      .select()
      .from(collateralItemsTable)
      .where(eq(collateralItemsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Предмет залога не найден" });
      return;
    }

    const typeId = parsed.data.collateralTypeId ?? existing.collateralTypeId;
    const [type] = await db
      .select()
      .from(collateralTypesTable)
      .where(eq(collateralTypesTable.id, typeId))
      .limit(1);
    if (!type) {
      res.status(400).json({ error: "Тип залога не найден" });
      return;
    }

    const settings = await getCollateralSettings();
    const nextMarketValue = parsed.data.marketValue ?? Number(existing.marketValue);
    const nextMetadata =
      parsed.data.metadata ?? (existing.metadata as Record<string, unknown> | null);
    const accepted = calculateAcceptedValue({
      typeCode: type.code,
      marketValue: nextMarketValue,
      metadata: nextMetadata,
      settings,
    });

    const [updated] = await db
      .update(collateralItemsTable)
      .set({
        collateralTypeId: typeId,
        title: parsed.data.title ?? existing.title,
        description:
          parsed.data.description === undefined ? existing.description : parsed.data.description,
        marketValue: String(nextMarketValue),
        acceptedValue: String(accepted.acceptedValue),
        discountApplied: accepted.discountApplied !== null ? String(accepted.discountApplied) : null,
        discountReason: accepted.discountReason,
        isThirdParty: parsed.data.isThirdParty ?? existing.isThirdParty,
        thirdPartyOwnerName:
          parsed.data.thirdPartyOwnerName === undefined
            ? existing.thirdPartyOwnerName
            : (parsed.data.thirdPartyOwnerName ?? null),
        metadata: nextMetadata ?? {},
        updatedBy: req.user?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(collateralItemsTable.id, id))
      .returning();

    await logActivity({
      type: "collateral_item_updated",
      description: `Collateral item "${updated.title}" updated`,
      entityId: updated.id,
      entityType: "collateral_item",
      user: req.user,
      metadata: { before: existing, after: updated },
    });

    res.json(updated);
  },
);

router.delete(
  "/collateral-items/:id",
  requireAuth,
  requireCollateralItemAccess,
  async (req, res) => {
    const id = Number(req.params.id);
    const [archived] = await db
      .update(collateralItemsTable)
      .set({ isActive: false, updatedBy: req.user?.id ?? null, updatedAt: new Date() })
      .where(eq(collateralItemsTable.id, id))
      .returning();
    if (!archived) {
      res.status(404).json({ error: "Предмет залога не найден" });
      return;
    }

    await logActivity({
      type: "collateral_item_archived",
      description: `Collateral item "${archived.title}" archived`,
      entityId: archived.id,
      entityType: "collateral_item",
      user: req.user,
    });

    res.json({ success: true });
  },
);

// ─── Estimates ──────────────────────────────────────────────────────────────

router.post(
  "/clients/:id/collateral-estimates",
  requireAuth,
  requireClientAccess,
  async (req, res) => {
    const clientId = Number(req.params.id);
    const parsed = CreateCollateralEstimateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректные данные", details: parsed.error.issues });
      return;
    }

    const [product] = await db
      .select()
      .from(creditProductsTable)
      .where(eq(creditProductsTable.id, parsed.data.creditProductId))
      .limit(1);
    if (!product) {
      res.status(400).json({ error: "Кредитный продукт не найден" });
      return;
    }

    const items = await db
      .select({
        id: collateralItemsTable.id,
        clientId: collateralItemsTable.clientId,
        isActive: collateralItemsTable.isActive,
        marketValue: collateralItemsTable.marketValue,
        acceptedValue: collateralItemsTable.acceptedValue,
        discountApplied: collateralItemsTable.discountApplied,
        typeCode: collateralTypesTable.code,
      })
      .from(collateralItemsTable)
      .innerJoin(
        collateralTypesTable,
        eq(collateralItemsTable.collateralTypeId, collateralTypesTable.id),
      )
      .where(inArray(collateralItemsTable.id, parsed.data.collateralItemIds));

    if (items.length !== parsed.data.collateralItemIds.length) {
      res.status(400).json({ error: "Не все выбранные предметы залога существуют" });
      return;
    }
    if (items.some((it) => it.clientId !== clientId)) {
      res.status(400).json({ error: "Предметы залога принадлежат другому клиенту" });
      return;
    }
    if (items.some((it) => !it.isActive)) {
      res.status(400).json({ error: "Среди выбранных есть архивные предметы залога" });
      return;
    }

    const settings = await getCollateralSettings();
    const calcItems = items.map((it) => ({
      typeCode: it.typeCode,
      marketValue: it.marketValue,
      acceptedValue: it.acceptedValue,
    }));
    const totals = calculateEstimateTotals({
      items: calcItems,
      requestedLoanAmount: parsed.data.requestedLoanAmount,
      coverageRatio: settings.coverageRatio,
    });

    const rate = extractAnnualRate(product.rateUZS);

    const [estimate] = await db
      .insert(collateralEstimatesTable)
      .values({
        clientId,
        creditProductId: product.id,
        requestedLoanAmount: String(parsed.data.requestedLoanAmount),
        currency: parsed.data.currency ?? "UZS",
        totalMarketValue: String(totals.totalMarketValue),
        totalAcceptedValue: String(totals.totalAcceptedValue),
        coverageRatioApplied: String(settings.coverageRatio),
        requiredCollateralValue: String(totals.requiredCollateralValue),
        coveragePercent: String(totals.coveragePercent),
        maxLoanAmount: String(totals.maxLoanAmount),
        annualRateApplied: rate.numeric !== null ? String(rate.numeric) : null,
        annualRateAppliedRaw: rate.raw,
        resultStatus: totals.resultStatus,
        disclaimer: DISCLAIMER_RU,
        notes: parsed.data.notes ?? null,
        hasEquipmentOnly: isEquipmentOnly(calcItems),
        createdBy: req.user?.id ?? null,
      })
      .returning();

    if (items.length > 0) {
      await db.insert(collateralEstimateItemsTable).values(
        items.map((it) => ({
          estimateId: estimate.id,
          collateralItemId: it.id,
          marketValueSnapshot: it.marketValue,
          discountAppliedSnapshot: it.discountApplied,
          acceptedValueSnapshot: it.acceptedValue,
        })),
      );
    }

    await logActivity({
      type: "collateral_estimate_created",
      description: `Collateral estimate created for client ${clientId} (loan ${parsed.data.requestedLoanAmount})`,
      entityId: estimate.id,
      entityType: "collateral_estimate",
      user: req.user,
      metadata: {
        clientId,
        requestedLoanAmount: parsed.data.requestedLoanAmount,
        totalAcceptedValue: totals.totalAcceptedValue,
        coveragePercent: totals.coveragePercent,
        resultStatus: totals.resultStatus,
        itemCount: items.length,
        itemTypes: Array.from(new Set(items.map((it) => it.typeCode))),
        hasEquipmentOnly: estimate.hasEquipmentOnly,
      },
    });

    res.status(201).json({ ...estimate, totals, items });
  },
);

router.get(
  "/clients/:id/collateral-estimates",
  requireAuth,
  requireClientAccess,
  async (req, res) => {
    const clientId = Number(req.params.id);
    const rows = await db
      .select()
      .from(collateralEstimatesTable)
      .where(eq(collateralEstimatesTable.clientId, clientId))
      .orderBy(desc(collateralEstimatesTable.createdAt));
    res.json(rows);
  },
);

router.get(
  "/collateral-estimates/:id",
  requireAuth,
  requireCollateralEstimateAccess,
  async (req, res) => {
    const id = Number(req.params.id);
    const [estimate] = await db
      .select()
      .from(collateralEstimatesTable)
      .where(eq(collateralEstimatesTable.id, id))
      .limit(1);
    if (!estimate) {
      res.status(404).json({ error: "Расчёт залога не найден" });
      return;
    }

    const items = await db
      .select({
        snapshot: collateralEstimateItemsTable,
        item: collateralItemsTable,
        typeCode: collateralTypesTable.code,
        typeNameRu: collateralTypesTable.nameRu,
      })
      .from(collateralEstimateItemsTable)
      .innerJoin(
        collateralItemsTable,
        eq(collateralEstimateItemsTable.collateralItemId, collateralItemsTable.id),
      )
      .innerJoin(
        collateralTypesTable,
        eq(collateralItemsTable.collateralTypeId, collateralTypesTable.id),
      )
      .where(eq(collateralEstimateItemsTable.estimateId, id));

    res.json({ ...estimate, items });
  },
);

router.use((err: Error, _req: Request, res: Response, _next: unknown) => {
  logger.error({ err }, "Collateral route error");
  res.status(500).json({ error: "Внутренняя ошибка" });
});

export default router;
