# Minerva Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AI-driven flows with deterministic rule-based logic, give the bank an admin-editable Credit Policy Parameters page, replace the multi-step questionnaire with a single fixed form, and decommission the Ollama service.

**Architecture:** B2 (admin policy parameters page) ships first because B1 (rule engine) reads from it. B1 replaces each AI surface one at a time so the failure surface is bounded. B3 then replaces the questionnaire UI with a fixed form that feeds the rule engine. B3a archives the legacy questionnaire tables. B4 removes the Ollama service after B1 is proven stable.

**Tech Stack:** TypeScript, Node 22, Express 5, drizzle-orm 0.45 (Postgres), React 19 + Vite 7 + TanStack Query 5 (mini-app + admin), vitest, lucide-react, react-i18next.

**Spec:** `docs/superpowers/specs/2026-05-05-minerva-changes-design.md` § 5 (Phase B).
**Branch base:** `main`. Each task group below uses its own `feat/*` branch. Tag a `v2.x.0` on `main` before each merge.

---

## Pre-flight (do once before starting any task group)

### Task 0: Confirm baseline

- [ ] **Step 0.1: Verify clean state**

```bash
git fetch origin
git checkout main && git pull --ff-only
git status --short    # expect empty
```

- [ ] **Step 0.2: Verify Phase A is in main**

```bash
git log --oneline | head -10
```

Expected: see merge commits for PRs #2, #3, #4, #5 + Dockerfile fix + the migration pre-deploy era. Tag `v2.5.0` should exist.

- [ ] **Step 0.3: Tag baseline**

```bash
git tag -a v2.5.0-pre-phase-b -m "Pre-Phase-B baseline (post-Phase-A)"
git push origin v2.5.0-pre-phase-b
```

---

## B2: Admin Credit Policy Parameters page

**Why first:** the rule engine in B1 reads parameters from this. Without B2, B1 can't replace the recommendation AI.

**Branch:** `feat/policy-params` off `main`.

### Task B2.1: Schema for policy_param_versions

**Files:**
- Create: `lib/db/src/schema/policy-param-versions.ts`
- Modify: `lib/db/src/schema/index.ts`
- Migration: `lib/db/drizzle/0007_policy_param_versions.sql`

- [ ] **Step 1: Create the schema file**

```ts
// lib/db/src/schema/policy-param-versions.ts
import { pgTable, serial, text, jsonb, timestamp, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Versioned credit-policy parameters. Each row is a complete snapshot of every
// numeric policy value (rates, ratios, term caps, etc.). The active row is
// whichever has the latest effective_from <= now() AND (effective_to IS NULL
// OR effective_to > now()).
export const policyParamVersionsTable = pgTable("policy_param_versions", {
  id: serial("id").primaryKey(),
  version: text("version").notNull(),               // e.g. "2026.05" — human label
  effectiveFrom: timestamp("effective_from").notNull(),
  effectiveTo: timestamp("effective_to"),           // null = open-ended
  value: jsonb("value").notNull(),                  // PolicyParams JSON shape
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("policy_param_versions_effective_idx").on(table.effectiveFrom),
]);

export type PolicyParamVersion = typeof policyParamVersionsTable.$inferSelect;
```

- [ ] **Step 2: Re-export**

In `lib/db/src/schema/index.ts`, add:

```ts
export * from "./policy-param-versions";
```

- [ ] **Step 3: Generate or hand-write migration**

```bash
pnpm --filter @workspace/db drizzle-kit generate
```

If sandbox-blocked, manually create `lib/db/drizzle/0007_policy_param_versions.sql`:

```sql
CREATE TABLE IF NOT EXISTS "policy_param_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "version" text NOT NULL,
  "effective_from" timestamp NOT NULL,
  "effective_to" timestamp,
  "value" jsonb NOT NULL,
  "created_by" integer REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "policy_param_versions_effective_idx" ON "policy_param_versions" ("effective_from");
```

Manually update `0007_snapshot.json` (copy 0006, fresh UUID, prevId chain, add the new table) and `_journal.json` (append entry idx 7).

- [ ] **Step 4: Commit**

```bash
git checkout -b feat/policy-params main
git add lib/db
git commit -m "feat(policy): schema for versioned credit policy parameters"
```

### Task B2.2: PolicyParams type + service

**Files:**
- Create: `artifacts/api-server/src/lib/policy-params.ts`
- Test: `artifacts/api-server/src/__tests__/policy-params.test.ts`

- [ ] **Step 1: Failing test**

```ts
// artifacts/api-server/src/__tests__/policy-params.test.ts
import { describe, it, expect } from "vitest";
import { defaultPolicyParams } from "../lib/policy-params";

describe("PolicyParams shape", () => {
  it("default has all required keys", () => {
    const p = defaultPolicyParams();
    expect(p.minCoverageRatio).toBe(1.25);
    expect(p.collateralDiscounts.realEstate).toBe(0.90);
    expect(p.dscrMax).toBe(0.80);
    expect(p.dscrMaxFx).toBe(0.50);
    expect(p.minRatesUzs.micro.le12m).toBe(0.24);
    expect(p.maxTermMonths.workingCapital).toBe(36);
    expect(p.negativeIndustryKeywords).toContain("tobacco");
  });
});
```

- [ ] **Step 2: Implement**

```ts
// artifacts/api-server/src/lib/policy-params.ts
import { db, policyParamVersionsTable } from "@workspace/db";
import { lte, isNull, or, gt, and, desc } from "drizzle-orm";

export interface PolicyParams {
  minCoverageRatio: number;                             // 1.25
  collateralDiscounts: {
    governmentSecurities: number;                       // 1.00
    realEstate: number;                                 // 0.90
    vehicles: number;                                   // 0.80
    corporateSecurities: number;                        // 0.80
    inventoryCirculation: number;                       // 0.80
    equipment: number;                                  // 0.70
  };
  transportAgeThresholdYears: number;                   // 7
  transportAgeDiscount: number;                         // 0.40
  dscrMax: number;                                      // 0.80
  dscrMaxFx: number;                                    // 0.50
  debtToEquityMax: number;                              // 1.00
  loanToWorkingCapitalMax: number;                      // 0.70
  minRatesUzs: {
    micro:  { le12m: number; gt12m: number };           // 0.24, 0.26
    small:  { le12m: number; gt12m: number };           // 0.24, 0.25
    medium: { any: number };                            // 0.24
  };
  minRatesFx: {
    micro: number;   // 0.14
    small: number;   // 0.13
    medium: number;  // 0.12
  };
  maxTermMonths: {
    workingCapital: number;  // 36
    fixedAssets: number;     // 60
  };
  negativeIndustryKeywords: string[];
  graduatedLending: {
    loan1MaxMonths: number;
    loan1MaxMonthsTrade: number;
    loan2MaxMonths: number;
    loan3MaxMonths: number;
  };
  creditCommitteeLimitsUsd: {
    singleBorrower: number;
    relatedGroup: number;
  };
}

export function defaultPolicyParams(): PolicyParams {
  return {
    minCoverageRatio: 1.25,
    collateralDiscounts: {
      governmentSecurities: 1.00,
      realEstate: 0.90,
      vehicles: 0.80,
      corporateSecurities: 0.80,
      inventoryCirculation: 0.80,
      equipment: 0.70,
    },
    transportAgeThresholdYears: 7,
    transportAgeDiscount: 0.40,
    dscrMax: 0.80,
    dscrMaxFx: 0.50,
    debtToEquityMax: 1.00,
    loanToWorkingCapitalMax: 0.70,
    minRatesUzs: {
      micro:  { le12m: 0.24, gt12m: 0.26 },
      small:  { le12m: 0.24, gt12m: 0.25 },
      medium: { any:   0.24 },
    },
    minRatesFx: { micro: 0.14, small: 0.13, medium: 0.12 },
    maxTermMonths: { workingCapital: 36, fixedAssets: 60 },
    negativeIndustryKeywords: [
      "tobacco","weapons","gambling","casino","alcoholic_strong",
      "fur","endangered","currency_speculation","securities_invest",
    ],
    graduatedLending: {
      loan1MaxMonths: 6,
      loan1MaxMonthsTrade: 3,
      loan2MaxMonths: 9,
      loan3MaxMonths: 12,
    },
    creditCommitteeLimitsUsd: {
      singleBorrower: 1_000_000.01,
      relatedGroup:   5_000_000.01,
    },
  };
}

let cache: { value: PolicyParams; loadedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function getActivePolicyParams(asOf: Date = new Date()): Promise<PolicyParams> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.value;
  const [row] = await db
    .select()
    .from(policyParamVersionsTable)
    .where(
      and(
        lte(policyParamVersionsTable.effectiveFrom, asOf),
        or(
          isNull(policyParamVersionsTable.effectiveTo),
          gt(policyParamVersionsTable.effectiveTo, asOf),
        ),
      ),
    )
    .orderBy(desc(policyParamVersionsTable.effectiveFrom))
    .limit(1);
  const value = (row?.value as PolicyParams) ?? defaultPolicyParams();
  cache = { value, loadedAt: Date.now() };
  return value;
}

export function _resetPolicyParamsCacheForTests() {
  cache = null;
}
```

- [ ] **Step 3: Run test**

```bash
pnpm --filter @workspace/api-server test policy-params
```

Expected: 1/1 pass. (Sandbox may block — manually trace if needed.)

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/lib/policy-params.ts artifacts/api-server/src/__tests__/policy-params.test.ts
git commit -m "feat(policy): PolicyParams type + getActivePolicyParams service"
```

### Task B2.3: Seed initial v1 row

**Files:**
- Create: `lib/db/scripts/seed-policy-params-v1.ts`
- Modify: `artifacts/api-server/src/index.ts` or wherever the boot-time seeding lives, to call this on first boot.

- [ ] **Step 1: Seed script**

```ts
// lib/db/scripts/seed-policy-params-v1.ts
import { db, policyParamVersionsTable } from "../src";
import { defaultPolicyParams } from "../../../artifacts/api-server/src/lib/policy-params";

async function main() {
  const existing = await db.select().from(policyParamVersionsTable).limit(1);
  if (existing.length > 0) {
    console.log("policy_param_versions already has rows; skipping seed");
    return;
  }
  const [row] = await db.insert(policyParamVersionsTable).values({
    version: "2026.05",
    effectiveFrom: new Date("2026-05-01T00:00:00Z"),
    effectiveTo: null,
    value: defaultPolicyParams(),
  }).returning();
  console.log(`seeded policy_param_versions row id=${row.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Wire into boot or migration runner**

Either:
- Add to api-server's startup sequence (after migrate, before listen): import and call the seed function (idempotent).
- OR run as a one-off via `pnpm --filter @workspace/db tsx scripts/seed-policy-params-v1.ts` after the migration applies.

Recommended: add to api-server boot, idempotent. Search for existing seed patterns:

```bash
git grep -n "seed\|seedDatabase\|Seed" artifacts/api-server/src/index.ts
```

Follow the existing pattern (e.g., wrap in `if (process.env.NODE_ENV !== 'test')`).

- [ ] **Step 3: Commit**

```bash
git add lib/db/scripts/seed-policy-params-v1.ts artifacts/api-server/src
git commit -m "feat(policy): seed initial v1 policy parameters on first boot"
```

### Task B2.4: API endpoints — read + create new version

**Files:**
- Create: `artifacts/api-server/src/routes/policy-params.ts`
- Modify: `artifacts/api-server/src/routes/index.ts` (register router)
- Test: `artifacts/api-server/src/__tests__/policy-params-routes.test.ts`

- [ ] **Step 1: Failing test**

```ts
// artifacts/api-server/src/__tests__/policy-params-routes.test.ts
import { describe, it, expect, vi } from "vitest";

// Smoke test only (full HTTP test would need supertest setup).
describe("policy-params routes", () => {
  it("module exports a default router", async () => {
    const mod = await import("../routes/policy-params");
    expect(mod.default).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// artifacts/api-server/src/routes/policy-params.ts
import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, policyParamVersionsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { guestAuth, requirePermission } from "../middleware/auth";
import { getActivePolicyParams, _resetPolicyParamsCacheForTests } from "../lib/policy-params";

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
    micro:  z.object({ le12m: z.number().min(0).max(1), gt12m: z.number().min(0).max(1) }),
    small:  z.object({ le12m: z.number().min(0).max(1), gt12m: z.number().min(0).max(1) }),
    medium: z.object({ any:   z.number().min(0).max(1) }),
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
    const body = z.object({
      version: z.string().min(1),
      effectiveFrom: z.string().datetime(),
      value: PolicyParamsSchema,
    }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_body", details: body.error.flatten() });

    const [row] = await db.insert(policyParamVersionsTable).values({
      version: body.data.version,
      effectiveFrom: new Date(body.data.effectiveFrom),
      effectiveTo: null,
      value: body.data.value,
      createdBy: (req as any).user?.id ?? null,
    }).returning();

    _resetPolicyParamsCacheForTests();
    res.status(201).json(row);
  },
);

export default router;
```

- [ ] **Step 3: Register**

In `artifacts/api-server/src/routes/index.ts`, follow existing pattern to import + use the router.

- [ ] **Step 4: Run test**

```bash
pnpm --filter @workspace/api-server test policy-params-routes
```

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes
git commit -m "feat(policy): admin policy-params API endpoints"
```

### Task B2.5: Admin UI — Credit Policy Parameters page

**Files:**
- Create: `artifacts/admin/src/pages/credit-policy.tsx`
- Modify: `artifacts/admin/src/App.tsx` (route)
- Modify: `artifacts/admin/src/components/layout.tsx` (sidebar entry)
- Modify: `artifacts/admin/src/i18n/{ru,uz}.json` (labels)

- [ ] **Step 1: Build the page**

```tsx
// artifacts/admin/src/pages/credit-policy.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { buildApiUrl } from "@/lib/api";
import { buildAuthHeaders, buildJsonHeaders } from "@/lib/auth-headers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";

interface PolicyParams {
  minCoverageRatio: number;
  collateralDiscounts: Record<string, number>;
  transportAgeThresholdYears: number;
  transportAgeDiscount: number;
  dscrMax: number;
  dscrMaxFx: number;
  debtToEquityMax: number;
  loanToWorkingCapitalMax: number;
  minRatesUzs: { micro: { le12m: number; gt12m: number }; small: { le12m: number; gt12m: number }; medium: { any: number } };
  minRatesFx: { micro: number; small: number; medium: number };
  maxTermMonths: { workingCapital: number; fixedAssets: number };
  negativeIndustryKeywords: string[];
  graduatedLending: { loan1MaxMonths: number; loan1MaxMonthsTrade: number; loan2MaxMonths: number; loan3MaxMonths: number };
  creditCommitteeLimitsUsd: { singleBorrower: number; relatedGroup: number };
}

export default function CreditPolicyPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<PolicyParams | null>(null);
  const [version, setVersion] = useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = useState<string>("");

  const { data: active } = useQuery<PolicyParams>({
    queryKey: ["policy-params", "active"],
    queryFn: () =>
      fetch(buildApiUrl("/api/admin/policy-params/active"), { headers: buildAuthHeaders() })
        .then((r) => r.json()),
  });

  useEffect(() => {
    if (active && !draft) {
      setDraft(active);
      setVersion(`${new Date().getFullYear()}.${String(new Date().getMonth() + 1).padStart(2, "0")}`);
      setEffectiveFrom(new Date().toISOString());
    }
  }, [active, draft]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(buildApiUrl("/api/admin/policy-params/versions"), {
        method: "POST",
        headers: buildJsonHeaders(),
        body: JSON.stringify({ version, effectiveFrom, value: draft }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("policy.savedTitle", { defaultValue: "Saved" }) });
      qc.invalidateQueries({ queryKey: ["policy-params"] });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: t("policy.saveFailed", { defaultValue: "Save failed" }), description: String(err) });
    },
  });

  if (!draft) return <div className="p-8 text-muted-foreground">{t("common.loading")}</div>;

  const num = (path: (string | number)[], val: string) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return;
    setDraft((d) => {
      const next = JSON.parse(JSON.stringify(d));
      let cur: any = next;
      for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
      cur[path[path.length - 1]] = n;
      return next;
    });
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-card border rounded-xl p-5 space-y-3">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );

  const Field = ({ label, value, onChange, step = "0.01" }: { label: string; value: number; onChange: (v: string) => void; step?: string }) => (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">{t("policy.title", { defaultValue: "Credit Policy Parameters" })}</h2>
        <p className="text-sm text-muted-foreground">{t("policy.subtitle", { defaultValue: "Editable rates, ratios, and term caps applied to new loan calculations." })}</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
        <strong>{t("policy.versionLabel", { defaultValue: "New version" })}:</strong>{" "}
        <Input className="inline-block w-32 mx-2" value={version} onChange={(e) => setVersion(e.target.value)} />
        <strong className="ml-4">{t("policy.effectiveFromLabel", { defaultValue: "Effective from" })}:</strong>{" "}
        <Input type="datetime-local" className="inline-block w-56 mx-2" value={effectiveFrom.slice(0, 16)} onChange={(e) => setEffectiveFrom(new Date(e.target.value).toISOString())} />
      </div>

      <Section title={t("policy.section.coverage", { defaultValue: "Coverage & Discounts" })}>
        <Field label={t("policy.minCoverageRatio", { defaultValue: "Min coverage ratio" })} value={draft.minCoverageRatio} onChange={(v) => num(["minCoverageRatio"], v)} />
        <Field label={t("policy.realEstate", { defaultValue: "Real estate %" })} value={draft.collateralDiscounts.realEstate} onChange={(v) => num(["collateralDiscounts", "realEstate"], v)} />
        <Field label={t("policy.vehicles", { defaultValue: "Vehicles %" })} value={draft.collateralDiscounts.vehicles} onChange={(v) => num(["collateralDiscounts", "vehicles"], v)} />
        <Field label={t("policy.equipment", { defaultValue: "Equipment %" })} value={draft.collateralDiscounts.equipment} onChange={(v) => num(["collateralDiscounts", "equipment"], v)} />
        <Field label={t("policy.govSecurities", { defaultValue: "Government securities %" })} value={draft.collateralDiscounts.governmentSecurities} onChange={(v) => num(["collateralDiscounts", "governmentSecurities"], v)} />
        <Field label={t("policy.corpSecurities", { defaultValue: "Corporate securities %" })} value={draft.collateralDiscounts.corporateSecurities} onChange={(v) => num(["collateralDiscounts", "corporateSecurities"], v)} />
        <Field label={t("policy.inventory", { defaultValue: "Inventory %" })} value={draft.collateralDiscounts.inventoryCirculation} onChange={(v) => num(["collateralDiscounts", "inventoryCirculation"], v)} />
        <Field label={t("policy.transportAge", { defaultValue: "Transport age threshold (years)" })} value={draft.transportAgeThresholdYears} onChange={(v) => num(["transportAgeThresholdYears"], v)} step="1" />
        <Field label={t("policy.transportAgeDisc", { defaultValue: "Transport age discount %" })} value={draft.transportAgeDiscount} onChange={(v) => num(["transportAgeDiscount"], v)} />
      </Section>

      <Section title={t("policy.section.ratios", { defaultValue: "Ratios" })}>
        <Field label={t("policy.dscrMax", { defaultValue: "DSCR max" })} value={draft.dscrMax} onChange={(v) => num(["dscrMax"], v)} />
        <Field label={t("policy.dscrMaxFx", { defaultValue: "DSCR max (FX)" })} value={draft.dscrMaxFx} onChange={(v) => num(["dscrMaxFx"], v)} />
        <Field label={t("policy.debtToEquity", { defaultValue: "Debt/equity max" })} value={draft.debtToEquityMax} onChange={(v) => num(["debtToEquityMax"], v)} />
        <Field label={t("policy.loanToWc", { defaultValue: "Loan/working-capital max" })} value={draft.loanToWorkingCapitalMax} onChange={(v) => num(["loanToWorkingCapitalMax"], v)} />
      </Section>

      <Section title={t("policy.section.ratesUzs", { defaultValue: "Min rates — UZS" })}>
        <Field label="Micro ≤12m" value={draft.minRatesUzs.micro.le12m} onChange={(v) => num(["minRatesUzs", "micro", "le12m"], v)} />
        <Field label="Micro >12m" value={draft.minRatesUzs.micro.gt12m} onChange={(v) => num(["minRatesUzs", "micro", "gt12m"], v)} />
        <Field label="Small ≤12m" value={draft.minRatesUzs.small.le12m} onChange={(v) => num(["minRatesUzs", "small", "le12m"], v)} />
        <Field label="Small >12m" value={draft.minRatesUzs.small.gt12m} onChange={(v) => num(["minRatesUzs", "small", "gt12m"], v)} />
        <Field label="Medium" value={draft.minRatesUzs.medium.any} onChange={(v) => num(["minRatesUzs", "medium", "any"], v)} />
      </Section>

      <Section title={t("policy.section.ratesFx", { defaultValue: "Min rates — FX" })}>
        <Field label="Micro" value={draft.minRatesFx.micro} onChange={(v) => num(["minRatesFx", "micro"], v)} />
        <Field label="Small" value={draft.minRatesFx.small} onChange={(v) => num(["minRatesFx", "small"], v)} />
        <Field label="Medium" value={draft.minRatesFx.medium} onChange={(v) => num(["minRatesFx", "medium"], v)} />
      </Section>

      <Section title={t("policy.section.terms", { defaultValue: "Terms" })}>
        <Field label={t("policy.maxTermWc", { defaultValue: "Max term (working capital, mo)" })} value={draft.maxTermMonths.workingCapital} onChange={(v) => num(["maxTermMonths", "workingCapital"], v)} step="1" />
        <Field label={t("policy.maxTermFa", { defaultValue: "Max term (fixed assets, mo)" })} value={draft.maxTermMonths.fixedAssets} onChange={(v) => num(["maxTermMonths", "fixedAssets"], v)} step="1" />
      </Section>

      <Section title={t("policy.section.industries", { defaultValue: "Negative industry keywords" })}>
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground">{t("policy.negKeywordsLabel", { defaultValue: "Comma-separated" })}</Label>
          <Input
            value={draft.negativeIndustryKeywords.join(", ")}
            onChange={(e) =>
              setDraft((d) => d ? { ...d, negativeIndustryKeywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : d)
            }
          />
        </div>
      </Section>

      <div className="flex gap-2 sticky bottom-4 bg-background p-3 rounded-xl shadow-md">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? t("common.saving") : t("policy.saveAsNewVersion", { defaultValue: "Save as new version" })}
        </Button>
        <Button variant="outline" onClick={() => setDraft(active ?? null)}>
          {t("policy.discardChanges", { defaultValue: "Discard" })}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire route + sidebar**

In `App.tsx` add a lazy route at `/credit-policy`. In the sidebar (`components/layout.tsx`) add a nav entry with `requiredRoles: ["superadmin", "head_office_admin"]` (only head office can edit policy).

- [ ] **Step 3: i18n strings**

Add a `policy` namespace to `artifacts/admin/src/i18n/ru.json` and `uz.json` with the keys used above. Russian: "Параметры кредитной политики", "Сохранить как новую версию", etc. Uzbek: "Kredit siyosati parametrlari", "Yangi versiya sifatida saqlash", etc.

- [ ] **Step 4: Manual smoke**

Open `/admin/credit-policy` → adjust a number → click Save → confirm row appears in `policy_param_versions` table.

- [ ] **Step 5: Commit**

```bash
git add artifacts/admin/src
git commit -m "feat(policy): admin Credit Policy Parameters page"
```

### Task B2.6: PR + merge

```bash
git push -u origin feat/policy-params
gh pr create --base main --title "Policy: admin-editable Credit Policy Parameters (Phase B2)" --body "Closes Phase B item B2."
git checkout main && git pull --ff-only
git tag -a v2.6.0-pre-policy -m "Tag before policy-params merge"
git push origin v2.6.0-pre-policy
gh pr merge --merge
```

After merge, run the seed (idempotent) by redeploying or invoking the script. Verify `/admin/policy-params/active` returns the default values.

---

## B1: Replace AI surfaces with deterministic equivalents

**Branch:** `feat/de-ai` off `main` (after B2 merged).

### Task B1.1: Rule engine for product recommendations

**Files:**
- Create: `artifacts/api-server/src/lib/recommend-engine.ts`
- Test: `artifacts/api-server/src/__tests__/recommend-engine.test.ts`

- [ ] **Step 1: Failing test**

```ts
// artifacts/api-server/src/__tests__/recommend-engine.test.ts
import { describe, it, expect } from "vitest";
import { recommendProducts } from "../lib/recommend-engine";
import { defaultPolicyParams } from "../lib/policy-params";

const params = defaultPolicyParams();

describe("recommendProducts", () => {
  it("returns micro UZS rate ≥ minRate for amount/term", () => {
    const products = [
      { id: 1, segment: "micro", currency: "UZS", purpose: "working_capital", minRate: 0.20, maxRate: 0.30, maxTermMonths: 36 },
      { id: 2, segment: "micro", currency: "UZS", purpose: "working_capital", minRate: 0.10, maxRate: 0.15, maxTermMonths: 12 }, // below min — exclude
      { id: 3, segment: "small", currency: "UZS", purpose: "working_capital", minRate: 0.24, maxRate: 0.28, maxTermMonths: 36 }, // wrong segment
    ];
    const res = recommendProducts({
      products,
      params,
      client: { segment: "micro", currency: "UZS", purpose: "working_capital", desiredAmountUzs: 100_000_000, desiredTermMonths: 12 },
    });
    expect(res.map((p) => p.id)).toEqual([1]);
  });

  it("rejects negative-industry purposes", () => {
    const products = [{ id: 1, segment: "micro", currency: "UZS", purpose: "tobacco", minRate: 0.30, maxRate: 0.40, maxTermMonths: 12 }];
    const res = recommendProducts({
      products,
      params,
      client: { segment: "micro", currency: "UZS", purpose: "tobacco", desiredAmountUzs: 50_000_000, desiredTermMonths: 12 },
    });
    expect(res).toEqual([]);
  });

  it("excludes terms over the segment cap", () => {
    const products = [{ id: 1, segment: "micro", currency: "UZS", purpose: "working_capital", minRate: 0.24, maxRate: 0.30, maxTermMonths: 60 }];
    const res = recommendProducts({
      products,
      params,
      client: { segment: "micro", currency: "UZS", purpose: "working_capital", desiredAmountUzs: 50_000_000, desiredTermMonths: 48 }, // > maxTermMonths.workingCapital (36)
    });
    expect(res).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// artifacts/api-server/src/lib/recommend-engine.ts
import type { PolicyParams } from "./policy-params";

export interface ProductLike {
  id: number;
  segment: "micro" | "small" | "medium";
  currency: "UZS" | "USD" | "EUR" | "RUB";
  purpose: string;
  minRate: number;
  maxRate: number;
  maxTermMonths: number;
}

export interface ClientIntent {
  segment: "micro" | "small" | "medium";
  currency: "UZS" | "USD" | "EUR" | "RUB";
  purpose: string;
  desiredAmountUzs: number;
  desiredTermMonths: number;
}

export interface RecommendInput {
  products: ProductLike[];
  params: PolicyParams;
  client: ClientIntent;
}

function purposeCategory(purpose: string): "workingCapital" | "fixedAssets" {
  if (/equipment|vehicle|real_estate|fixed/i.test(purpose)) return "fixedAssets";
  return "workingCapital";
}

function minRequiredRate(params: PolicyParams, client: ClientIntent): number {
  const isFx = client.currency !== "UZS";
  if (isFx) return params.minRatesFx[client.segment];
  if (client.segment === "medium") return params.minRatesUzs.medium.any;
  return client.desiredTermMonths <= 12
    ? params.minRatesUzs[client.segment].le12m
    : params.minRatesUzs[client.segment].gt12m;
}

export function recommendProducts(input: RecommendInput): ProductLike[] {
  const { products, params, client } = input;

  // Hard reject: negative industries
  if (params.negativeIndustryKeywords.some((kw) => client.purpose.toLowerCase().includes(kw))) {
    return [];
  }

  const requiredRate = minRequiredRate(params, client);
  const segmentTermCap = params.maxTermMonths[purposeCategory(client.purpose)];

  return products
    .filter((p) => p.segment === client.segment)
    .filter((p) => p.currency === client.currency)
    .filter((p) => p.purpose === client.purpose)
    .filter((p) => p.minRate >= requiredRate)
    .filter((p) => client.desiredTermMonths <= Math.min(p.maxTermMonths, segmentTermCap))
    .sort((a, b) => a.minRate - b.minRate);  // cheapest first
}
```

- [ ] **Step 3: Run test**

```bash
pnpm --filter @workspace/api-server test recommend-engine
```

Expected: 3/3 pass.

- [ ] **Step 4: Commit**

```bash
git checkout -b feat/de-ai main
git add artifacts/api-server/src/lib/recommend-engine.ts artifacts/api-server/src/__tests__/recommend-engine.test.ts
git commit -m "feat(rec): rule engine for product recommendations"
```

### Task B1.2: Replace `/ai/recommend-products` route

**Files:**
- Modify: `artifacts/api-server/src/routes/ai.ts` (replace handler) OR create `routes/recommend.ts` and remove the AI version

- [ ] **Step 1: Find and read the existing handler**

```bash
git grep -n "recommend-products\|recommendProducts" artifacts/api-server/src/routes/
```

Note: the existing route's request shape (`{ clientId, ... }`) and response shape (`{ products: [...] }`).

- [ ] **Step 2: Refactor**

Replace the AI call with a call to `recommendProducts(...)`. Pseudocode:

```ts
// In the handler:
import { recommendProducts } from "../lib/recommend-engine";
import { getActivePolicyParams } from "../lib/policy-params";
import { creditProductsTable, clientsTable } from "@workspace/db";

const params = await getActivePolicyParams();

// Load all candidate products from DB. The shape may need adapting to ProductLike — map over the rows.
const productsRaw = await db.select().from(creditProductsTable).where(/* active */);
const products = productsRaw.map((p) => ({ id: p.id, segment: p.segment, currency: p.currency, purpose: p.purpose, minRate: Number(p.minRate), maxRate: Number(p.maxRate), maxTermMonths: p.maxTermMonths }));

// Load client's intent from form
const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
const intent = {
  segment: client.clientSegment ?? "micro",
  currency: req.body.currency ?? "UZS",
  purpose: req.body.purpose ?? "working_capital",
  desiredAmountUzs: Number(req.body.desiredAmountUzs ?? 0),
  desiredTermMonths: Number(req.body.desiredTermMonths ?? 12),
};

const recs = recommendProducts({ products, params, client: intent });
res.json({ products: recs });
```

Adapt to actual schema column names (`creditProductsTable` may have different fields).

- [ ] **Step 3: Manual smoke**

POST `/ai/recommend-products` with a known client → confirm response includes products + no AI calls in logs.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src
git commit -m "refactor(rec): replace AI recommend-products with rule engine"
```

### Task B1.3: Static template for offer summary

**Files:**
- Create: `artifacts/api-server/src/lib/offer-summary.ts`
- Modify: wherever `/ai/generate-offer-summary` is handled

- [ ] **Step 1: Implement template renderer**

```ts
// artifacts/api-server/src/lib/offer-summary.ts
const TEMPLATES = {
  ru: (vars: { clientName: string; productName: string; amountUzs: number; rate: number; termMonths: number }) =>
    `Уважаемый(ая) ${vars.clientName}, рассмотрите наше предложение по продукту "${vars.productName}". ` +
    `Сумма: ${vars.amountUzs.toLocaleString("ru-RU")} UZS, срок: ${vars.termMonths} мес., ставка: ${(vars.rate * 100).toFixed(1)}%.`,
  uz: (vars: { clientName: string; productName: string; amountUzs: number; rate: number; termMonths: number }) =>
    `Hurmatli ${vars.clientName}, "${vars.productName}" mahsulotimiz bo'yicha taklifimizni ko'rib chiqing. ` +
    `Summa: ${vars.amountUzs.toLocaleString("ru-RU")} UZS, muddat: ${vars.termMonths} oy, stavka: ${(vars.rate * 100).toFixed(1)}%.`,
};

export function renderOfferSummary(vars: { clientName: string; productName: string; amountUzs: number; rate: number; termMonths: number }, language: "ru" | "uz"): string {
  return TEMPLATES[language](vars);
}
```

- [ ] **Step 2: Replace endpoint handler**

In the existing `/ai/generate-offer-summary` handler, drop the LLM call and call `renderOfferSummary()` instead.

- [ ] **Step 3: Test**

```ts
// __tests__/offer-summary.test.ts
import { describe, it, expect } from "vitest";
import { renderOfferSummary } from "../lib/offer-summary";

describe("renderOfferSummary", () => {
  it("renders Russian", () => {
    const s = renderOfferSummary({ clientName: "Иван", productName: "Микро-кредит", amountUzs: 50_000_000, rate: 0.24, termMonths: 12 }, "ru");
    expect(s).toContain("Иван");
    expect(s).toContain("24.0%");
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src
git commit -m "refactor(offer): replace AI offer-summary with static template"
```

### Task B1.4: Remove `/ai/translate` endpoint

**Files:**
- Modify: `artifacts/api-server/src/routes/ai.ts`
- Modify: any frontend file that calls it

- [ ] **Step 1: Find all callers**

```bash
git grep -nE "/ai/translate|translateText\b" artifacts/
```

- [ ] **Step 2: Remove**

- Delete the route handler in `routes/ai.ts`.
- For each frontend caller: replace the API call with a direct lookup in `i18n` (the bundles already have RU + UZ for everything client-facing). If a string is missing from i18n, add it.

- [ ] **Step 3: Commit**

```bash
git add artifacts/
git commit -m "refactor(i18n): remove /ai/translate endpoint, use static i18n bundles"
```

### Task B1.5: Replace `/ai/extract-auto` with manual entry

**Files:**
- Modify: `artifacts/api-server/src/routes/ai.ts`
- Modify: mini-app collateral / vehicle scan flow

- [ ] **Step 1: Identify the flow**

```bash
git grep -nE "extract-auto|extractAuto" artifacts/
```

- [ ] **Step 2: Drop the route + remove the auto-fill UI step**

Mini-app collateral page currently posts the photo to `/ai/extract-auto` and receives parsed fields. Replace with: user enters fields manually; the photo is just stored as a `client_documents` row with `doc_type=vehicle_passport`.

Tesseract OCR (already in place) can still extract raw text and present it as a "scanned text" preview the user can copy from. No structured AI extraction.

- [ ] **Step 3: Commit**

```bash
git add artifacts/
git commit -m "refactor(scan): drop AI auto-extraction, manual entry only"
```

### Task B1.6: Soft-delete AI questionnaire endpoint

**Files:**
- Modify: `artifacts/api-server/src/routes/ai.ts`

- [ ] **Step 1: Make the endpoint return a 410 Gone**

```ts
router.post("/ai/generate-questionnaire", (_req, res) => {
  res.status(410).json({
    error: "endpoint_removed",
    message: "Questionnaire is no longer used. Use /mini-app/clients form instead.",
  });
});
```

This is a safety net while B3 lands the new form. After B3, the endpoint is fully deleted in B4.

- [ ] **Step 2: Commit**

```bash
git add artifacts/api-server/src/routes/ai.ts
git commit -m "refactor(ai): mark generate-questionnaire endpoint deprecated (410)"
```

### Task B1.7: PR + merge

```bash
git push -u origin feat/de-ai
gh pr create --base main --title "Replace AI surfaces with rule-based equivalents (Phase B1)"
git checkout main && git pull --ff-only
git tag -a v2.6.1-pre-deai -m "Tag before de-AI merge"
git push origin v2.6.1-pre-deai
gh pr merge --merge
```

Soak for 3 days. If recommendation outcomes look right and no error spike, proceed to B3.

---

## B3: Remove questionnaire, replace with fixed form

**Branch:** `feat/fixed-form` off `main` (after B1).

### Task B3.1: Schema additions to clients

**Files:**
- Modify: `lib/db/src/schema/clients.ts`
- Migration: `lib/db/drizzle/0008_clients_lead_fields.sql`

- [ ] **Step 1: Add columns**

In `clientsTable`, add (placement: near other lead-related columns):

```ts
leadSource: text("lead_source"),                    // enum-like; values listed below
referrerClientId: integer("referrer_client_id"),    // FK to clientsTable
selfCheckCitizenshipUz: boolean("self_check_citizenship_uz"),
selfCheckSixMonthsOperation: boolean("self_check_six_months_operation"),
selfCheckPredominantlyPrivate: boolean("self_check_predominantly_private"),
selfCheckBranchServiceArea: boolean("self_check_branch_service_area"),
purpose: text("purpose"),
desiredAmountUzs: numeric("desired_amount_uzs", { precision: 18, scale: 2 }),
desiredTermMonths: integer("desired_term_months"),
preferredCurrency: text("preferred_currency"),
```

Imports may need `boolean`, `numeric` added to drizzle import line.

Also add a comment listing canonical lead_source values:

```ts
// Canonical lead_source values:
//   direct_visit, referral_existing_client, mass_media_tv, mass_media_radio,
//   mass_media_print, mahalla_booklet, walk_in, other
```

- [ ] **Step 2: Status enum migration**

The existing `clientStatusEnum` has `"questionnaire"`. Add `"lead"` and back-fill:

```ts
export const clientStatusEnum = [
  "draft", "lead", "questionnaire",   // keep questionnaire as legacy
  "recommendation", "basket", "pdf_generated",
  "under_review", "approved", "completed", "rejected",
] as const;
```

After B3 ships and stabilizes, B3a will remove `"questionnaire"` from the enum.

- [ ] **Step 3: Generate migration**

```bash
pnpm --filter @workspace/db drizzle-kit generate
```

Or hand-write SQL:

```sql
ALTER TABLE "clients" ADD COLUMN "lead_source" text;
ALTER TABLE "clients" ADD COLUMN "referrer_client_id" integer REFERENCES "clients"("id");
ALTER TABLE "clients" ADD COLUMN "self_check_citizenship_uz" boolean;
ALTER TABLE "clients" ADD COLUMN "self_check_six_months_operation" boolean;
ALTER TABLE "clients" ADD COLUMN "self_check_predominantly_private" boolean;
ALTER TABLE "clients" ADD COLUMN "self_check_branch_service_area" boolean;
ALTER TABLE "clients" ADD COLUMN "purpose" text;
ALTER TABLE "clients" ADD COLUMN "desired_amount_uzs" numeric(18, 2);
ALTER TABLE "clients" ADD COLUMN "desired_term_months" integer;
ALTER TABLE "clients" ADD COLUMN "preferred_currency" text;

-- Backfill existing 'questionnaire' status to 'lead' (so users on the new
-- form's flow inherit a sensible status).
UPDATE "clients" SET "status" = 'lead' WHERE "status" = 'questionnaire';
```

- [ ] **Step 4: Update OpenAPI yaml**

Add the new fields to `Client` schema and `CreateClientBody` / `UpdateClientBody`. All optional + nullable.

- [ ] **Step 5: Regenerate clients (or manual edit if blocked)**

```bash
pnpm --filter @workspace/api-zod run codegen
pnpm --filter @workspace/api-client-react run codegen
```

- [ ] **Step 6: Commit**

```bash
git checkout -b feat/fixed-form main
git add lib/db lib/api-spec lib/api-zod lib/api-client-react
git commit -m "feat(form): clients schema for lead-source + intent + self-check"
```

### Task B3.2: Refactor mini-app new-client form

**Files:**
- Modify: `artifacts/mini-app/src/pages/new-client.tsx`

- [ ] **Step 1: Read the existing form**

```bash
sed -n '1,100p' artifacts/mini-app/src/pages/new-client.tsx
```

Note current sections, fields, mutations.

- [ ] **Step 2: Add new sections (preserve existing fields)**

Sections to ensure exist (add if missing, keep if present):
1. **Identity** — name, gender, phone, business name, business type
2. **Lead source** — radio group / chip selector for `lead_source` enum
3. **Referrer** — only shown when `lead_source = "referral_existing_client"`. Searchable client picker (existing clients).
4. **Location** — branch (auto from user.branchId), GPS pin (use existing `latitude`/`longitude` columns; the UI for capturing GPS lands in Phase C — for now just show "Add location later" placeholder if the columns are empty).
5. **Loan intent** — purpose (select), desired amount UZS, desired term months, currency.
6. **Self-check** — 4 checkboxes for the policy gates: citizenship UZ?, 6+ months operation?, predominantly private?, branch service area?

- [ ] **Step 3: Wire mutation to save all fields**

The mutation hits `POST /mini-app/clients`. Send the new fields. Server schema accepts them via the zod schemas updated in B3.1.

- [ ] **Step 4: Commit**

```bash
git add artifacts/mini-app/src/pages/new-client.tsx
git commit -m "feat(form): new-client form captures lead source + intent + self-check"
```

### Task B3.3: Delete questionnaire pages

**Files:**
- Delete: `artifacts/mini-app/src/pages/questionnaire.tsx`
- Modify: `artifacts/mini-app/src/App.tsx` (remove route, add 301 to /clients/new)

- [ ] **Step 1: Add a redirect for the old route**

In App.tsx:

```tsx
import { Redirect } from "wouter";
// replace the old <Route path="/questionnaire/:id"> with:
<Route path="/questionnaire/:id">
  {(params) => <Redirect to={`/clients/${params.id}`} />}
</Route>
```

- [ ] **Step 2: Delete the page**

```bash
git rm artifacts/mini-app/src/pages/questionnaire.tsx
```

- [ ] **Step 3: Update status state machine in client-detail**

Find any "next step" logic that points to `/questionnaire/...`. Replace with a route to the client-detail edit form.

- [ ] **Step 4: Commit**

```bash
git add artifacts/mini-app/src
git commit -m "feat(form): delete questionnaire pages, redirect old URLs"
```

### Task B3.4: Server-side: require new fields, generate recommendations after save

**Files:**
- Modify: `artifacts/api-server/src/routes/mini-app.ts` (POST clients handler)

- [ ] **Step 1: Auto-trigger recommendations**

After client creation, if `purpose` + `desiredAmountUzs` + `desiredTermMonths` are present, call the rule engine immediately and persist a list of recommended product IDs (or basket items). This replaces the questionnaire→recommendation flow.

- [ ] **Step 2: Set status to "lead"**

If client has all required form fields filled, set `status = "lead"` instead of `"draft"`.

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src
git commit -m "feat(form): auto-recommend after client creation; set status=lead"
```

### Task B3.5: PR + merge

```bash
git push -u origin feat/fixed-form
gh pr create --base main --title "Remove questionnaire, fixed client form (Phase B3)"
git checkout main && git pull --ff-only
git tag -a v2.7.0-pre-form -m "Tag before fixed-form merge"
git push origin v2.7.0-pre-form
gh pr merge --merge
```

---

## B3a: Archive questionnaire tables (after 7-day soak)

### Task B3a.1: Rename tables

After B3 has been live without rollback for 7+ days:

**Files:** `lib/db/drizzle/0009_archive_questionnaire.sql`

- [ ] **Step 1: SQL migration**

```sql
-- After 7+ days of stable operation under fixed-form flow.
ALTER TABLE "questionnaire_sessions" RENAME TO "archived_questionnaire_sessions";
ALTER TABLE "questionnaire_answers" RENAME TO "archived_questionnaire_answers";
```

- [ ] **Step 2: Drop schema files**

```bash
git rm lib/db/src/schema/* # only the questionnaire-related files if separate; otherwise edit mini-app.ts to remove the table definitions.
```

If table defs are in `mini-app.ts`, edit that file to remove `questionnaireSessionsTable` + `questionnaireAnswersTable` exports. Server code stops referencing them (it shouldn't after B3).

- [ ] **Step 3: Final clientStatusEnum cleanup**

Now also remove `"questionnaire"` from the enum:

```ts
export const clientStatusEnum = [
  "draft", "lead", "recommendation", "basket", "pdf_generated",
  "under_review", "approved", "completed", "rejected",
] as const;
```

Add a follow-up SQL constraint check or skip — the enum is TS-only since the column is `text`.

- [ ] **Step 4: Commit + PR**

```bash
git checkout -b feat/archive-questionnaire main
git add lib/db artifacts
git commit -m "chore(db): archive questionnaire tables; drop questionnaire status"
git push -u origin feat/archive-questionnaire
gh pr create --base main --title "Archive questionnaire tables (Phase B3a)"
gh pr merge --merge
```

---

## B4: Decommission Ollama service

**Branch:** `feat/decommission-ollama` off `main` (after B1 + B3 stable).

### Task B4.1: Remove server-side AI code

**Files:**
- Delete: `artifacts/api-server/src/ai/` directory (Ollama client, fallback logic)
- Delete: `artifacts/api-server/src/routes/ai.ts`
- Modify: `lib/api-spec/openapi.yaml` (remove 5 AI endpoints)
- Modify: `artifacts/api-server/src/index.ts` or routes/index.ts (remove ai router import)

- [ ] **Step 1: Delete files**

```bash
git rm -r artifacts/api-server/src/ai/
git rm artifacts/api-server/src/routes/ai.ts
```

- [ ] **Step 2: Remove from OpenAPI**

In `lib/api-spec/openapi.yaml`, find and delete the path entries for:
- `/ai/generate-questionnaire`
- `/ai/recommend-products`
- `/ai/generate-offer-summary`
- `/ai/translate`
- `/ai/extract-auto`

Plus any associated schemas only used by these (search for AiGenerateQuestionsBody, etc.).

- [ ] **Step 3: Regenerate clients**

```bash
pnpm --filter @workspace/api-zod run codegen
pnpm --filter @workspace/api-client-react run codegen
```

- [ ] **Step 4: Search for orphan callers**

```bash
git grep -nE "/ai/|AiGenerate|AiRecommend|AiExtract" artifacts/
```

Should return zero hits in production code (test files / docs are OK).

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/decommission-ollama main
git add -A artifacts/api-server/src lib/api-spec lib/api-zod lib/api-client-react
git commit -m "chore(ai): remove server-side AI code and endpoints"
```

### Task B4.2: Remove ollama-ai workspace and config

**Files:**
- Delete: `artifacts/ollama-ai/` directory
- Modify: `pnpm-workspace.yaml` (no change needed — `artifacts/*` glob auto-excludes)
- Modify: `docs/railway-deployment.md` (remove ollama-ai sections)

- [ ] **Step 1: Delete folder**

```bash
git rm -r artifacts/ollama-ai/
```

- [ ] **Step 2: Update Railway docs**

Open `docs/railway-deployment.md`. Delete or strikethrough sections referencing `ollama-ai`. Add a note: "ollama-ai service decommissioned 2026-MM-DD; remove from Railway dashboard manually."

- [ ] **Step 3: Remove env vars from docs**

Search and remove `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_MS`, `OLLAMA_BASE_URL` references in the docs.

- [ ] **Step 4: Commit**

```bash
git add -A artifacts docs
git commit -m "chore(ai): remove ollama-ai workspace; update Railway docs"
```

### Task B4.3: Manual Railway cleanup (user step)

Document in PR description:
1. Railway → delete `ollama-ai` service
2. Railway → delete the persistent volume mounted at `/root/.ollama`
3. Railway → backend-api service → Variables → remove `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_MS`

Saves ~$15-30/mo + simplifies the deploy graph.

### Task B4.4: PR + merge

```bash
git push -u origin feat/decommission-ollama
gh pr create --base main --title "Decommission Ollama service (Phase B4)" --body "After Phase B1 stable. User does manual Railway cleanup steps."
git checkout main && git pull --ff-only
git tag -a v2.8.0-pre-ollama-removal -m "Tag before Ollama removal"
git push origin v2.8.0-pre-ollama-removal
gh pr merge --merge
```

---

## Self-Review Checklist

**Spec coverage** (each B item from spec § 5):
- B1 → tasks B1.1–B1.7 ✓
- B2 → tasks B2.1–B2.6 ✓
- B3 → tasks B3.1–B3.5 ✓
- B3a → task B3a.1 ✓
- B4 → tasks B4.1–B4.4 ✓

**Type consistency**:
- `PolicyParams` defined in B2.2, consumed in B1.1 (rule engine). Same shape used in admin form (B2.5). ✓
- `ProductLike` and `ClientIntent` defined in B1.1 — adapt at integration time (B1.2) to match real `creditProductsTable` schema.

**Operational risks**:
- Schema migrations 0007, 0008, 0009 — apply via Pre-deploy command on each merge (already wired).
- Status enum `"lead"` add + backfill — single SQL UPDATE; safe.
- Ollama decommission ordered last so any AI-fallback emergency keeps Ollama as a recovery option until B1 is proven.

**Out of scope** (do not do in Phase B):
- Phase C marketing power-ups (rapid lead-capture, dashboards, button placement, reminders).
- Phase D field hardening (offline mode, bilingual PDF, signature, Espo reconcile).
- Live Espo activation (separate manual step — already deployed in Phase A as stub).

---

## Implementation Plan Scope

This plan covers Phase B as a single sequenced effort (B2 → B1 → B3 → B3a → B4). B3a runs after a 7-day soak; B4 runs after B1 is proven stable.

If the implementer finds the scope too large in a single session, they may split into per-sub-phase PRs (B2, B1, B3, B3a, B4) — each is independently mergeable, in that order.

---

*End of Phase B plan.*
