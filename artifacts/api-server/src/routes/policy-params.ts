import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, policyParamVersionsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { guestAuth, requirePermission } from "../middleware/auth";
import {
  getActivePolicyParams,
  _resetPolicyParamsCacheForTests,
} from "../lib/policy-params";

const router: IRouter = Router();

const PolicyParamsSchema = z.object({
  minCoverageRatio: z.number().min(0.5).max(5),
  collateralDiscounts: z.object({
    governmentSecurities: z.number().min(0).max(1),
    realEstate: z.number().min(0).max(1),
    vehicles: z.number().min(0).max(1),
    corporateSecurities: z.number().min(0).max(1),
    inventoryCirculation: z.number().min(0).max(1),
    equipment: z.number().min(0).max(1),
  }),
  transportAgeThresholdYears: z.number().int().min(1).max(30),
  transportAgeDiscount: z.number().min(0).max(1),
  dscrMax: z.number().min(0).max(2),
  dscrMaxFx: z.number().min(0).max(2),
  debtToEquityMax: z.number().min(0).max(10),
  loanToWorkingCapitalMax: z.number().min(0).max(2),
  minRatesUzs: z.object({
    micro: z.object({
      le12m: z.number().min(0).max(1),
      gt12m: z.number().min(0).max(1),
    }),
    small: z.object({
      le12m: z.number().min(0).max(1),
      gt12m: z.number().min(0).max(1),
    }),
    medium: z.object({ any: z.number().min(0).max(1) }),
  }),
  minRatesFx: z.object({
    micro: z.number().min(0).max(1),
    small: z.number().min(0).max(1),
    medium: z.number().min(0).max(1),
  }),
  maxTermMonths: z.object({
    workingCapital: z.number().int().min(1).max(120),
    fixedAssets: z.number().int().min(1).max(120),
  }),
  negativeIndustryKeywords: z.array(z.string()).max(50),
  graduatedLending: z.object({
    loan1MaxMonths: z.number().int().min(1).max(24),
    loan1MaxMonthsTrade: z.number().int().min(1).max(24),
    loan2MaxMonths: z.number().int().min(1).max(36),
    loan3MaxMonths: z.number().int().min(1).max(48),
  }),
  creditCommitteeLimitsUsd: z.object({
    singleBorrower: z.number().min(0),
    relatedGroup: z.number().min(0),
  }),
});

router.get(
  "/admin/policy-params/active",
  guestAuth,
  requirePermission("policy_params.read"),
  async (_req, res) => {
    const params = await getActivePolicyParams();
    res.json(params);
  },
);

router.get(
  "/admin/policy-params/versions",
  guestAuth,
  requirePermission("policy_params.read"),
  async (_req, res) => {
    const rows = await db
      .select()
      .from(policyParamVersionsTable)
      .orderBy(desc(policyParamVersionsTable.effectiveFrom))
      .limit(50);
    res.json(rows);
  },
);

router.post(
  "/admin/policy-params/versions",
  guestAuth,
  requirePermission("policy_params.update"),
  async (req, res) => {
    const body = z
      .object({
        version: z.string().min(1),
        effectiveFrom: z.string().datetime(),
        value: PolicyParamsSchema,
      })
      .safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: "invalid_body", details: body.error.flatten() });
      return;
    }
    const [row] = await db
      .insert(policyParamVersionsTable)
      .values({
        version: body.data.version,
        effectiveFrom: new Date(body.data.effectiveFrom),
        effectiveTo: null,
        value: body.data.value,
        createdBy:
          (req as { user?: { id?: number } }).user?.id ?? null,
      })
      .returning();
    _resetPolicyParamsCacheForTests();
    res.status(201).json(row);
  },
);

export default router;
