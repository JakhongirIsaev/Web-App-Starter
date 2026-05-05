# Minerva Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four Phase A items from the May 2026 design spec — PDF leave-behind redesign, Cloudflare R2 storage migration, EspoCRM outbound sync, and RBAC capability matrix — without regressing existing functionality.

**Architecture:** Each of the four items (A1–A4) is independently implementable and can be parallelized across feature branches. They share only the existing pnpm-workspace structure and Postgres database. RBAC (A4) is the only cross-cutting item; finish it before starting code in A2/A3 so new endpoints use the new permission middleware from day one.

**Tech Stack:** TypeScript, Node 22, Express 5, drizzle-orm 0.45 (Postgres), pdfkit 0.18, grammy 1.41, vitest, @aws-sdk/client-s3 (new), graphile-worker (new). Mini-app/admin: React 19 + Vite 7 + TanStack Query 5 + lucide-react ^0.545.

**Spec:** `docs/superpowers/specs/2026-05-05-minerva-changes-design.md`
**Branch base:** `main`. Each task group below uses its own `feat/*` branch off `main`. Tag `v2.x.0` on `main` before each merge.

---

## Pre-flight (do this once before starting any task group)

### Task 0: Confirm baseline

**Files:** none

- [ ] **Step 0.1: Verify branches are clean**

```bash
git fetch origin
git checkout main && git pull --ff-only
git status --short    # expect empty
git rev-list --left-right --count main...origin/main   # expect "0	0"
```

- [ ] **Step 0.2: Run existing tests as a baseline**

```bash
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/db test 2>/dev/null || true
```

Expected: all green. If anything fails on `main`, fix before continuing.

- [ ] **Step 0.3: Tag baseline for rollback**

```bash
git tag -a v2.0.0-baseline -m "Pre-Phase-A baseline"
git push origin v2.0.0-baseline   # only after user confirms push
```

---

## A4: RBAC Capability Matrix (do this FIRST)

**Why first:** A2 (storage) and A3 (Espo) add new endpoints. They should ship with the new `requirePermission` middleware from the start, not be retrofitted later.

**Branch:** `feat/rbac-matrix` off `main`.

### Task A4.1: Permission enum

**Files:**
- Create: `lib/api-spec/src/permissions.ts`

- [ ] **Step 1: Create the file**

```ts
// lib/api-spec/src/permissions.ts

export const PERMISSIONS = [
  // client
  "client.read.own",
  "client.read.branch",
  "client.read.all",
  "client.create",
  "client.update",
  "client.delete",
  "client.export",
  "client.import",

  // collateral
  "collateral.read",
  "collateral.update",
  "collateral.calculate",

  // policy params
  "policy_params.read",
  "policy_params.update",

  // user mgmt
  "user.read",
  "user.create",
  "user.update",
  "user.delete",

  // espo
  "espo.view_sync",
  "espo.retry_sync",

  // knowledge
  "knowledge.read",
  "knowledge.author",

  // reports
  "report.view_branch",
  "report.view_all",

  // storage / docs
  "storage.upload",
  "storage.delete",
  "storage.signed_url",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
```

- [ ] **Step 2: Commit**

```bash
git checkout -b feat/rbac-matrix main
git add lib/api-spec/src/permissions.ts
git commit -m "feat(rbac): introduce Permission union type"
```

### Task A4.2: Role → permissions map

**Files:**
- Create: `lib/api-spec/src/role-permissions.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/api-spec/src/__tests__/role-permissions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ROLE_PERMISSIONS, hasPermission } from "../role-permissions";

describe("ROLE_PERMISSIONS", () => {
  it("superadmin has every permission", () => {
    expect(hasPermission("superadmin", "client.delete")).toBe(true);
    expect(hasPermission("superadmin", "policy_params.update")).toBe(true);
  });

  it("hunter cannot manage users", () => {
    expect(hasPermission("hunter", "user.delete")).toBe(false);
  });

  it("branch_head sees only their branch", () => {
    expect(hasPermission("branch_head", "client.read.branch")).toBe(true);
    expect(hasPermission("branch_head", "client.read.all")).toBe(false);
  });

  it("editor cannot edit policy params", () => {
    expect(hasPermission("editor", "policy_params.update")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @workspace/api-spec test
```

Expected: FAIL with "Cannot find module '../role-permissions'".

- [ ] **Step 3: Implement**

```ts
// lib/api-spec/src/role-permissions.ts
import { PERMISSIONS, type Permission } from "./permissions";

export const ROLES = [
  "superadmin",
  "head_office_admin",
  "editor",
  "branch_head",
  "hunter",
] as const;
export type Role = (typeof ROLES)[number];

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  superadmin: ALL,
  head_office_admin: ALL.filter((p) => p !== "client.delete"),
  editor: [
    "client.read.all",
    "client.create",
    "client.update",
    "client.export",
    "client.import",
    "collateral.read",
    "collateral.calculate",
    "policy_params.read",
    "user.read",
    "espo.view_sync",
    "knowledge.read",
    "knowledge.author",
    "report.view_branch",
    "storage.upload",
    "storage.signed_url",
  ],
  branch_head: [
    "client.read.branch",
    "client.update",
    "collateral.read",
    "collateral.calculate",
    "policy_params.read",
    "user.read",
    "espo.view_sync",
    "knowledge.read",
    "report.view_branch",
    "storage.upload",
    "storage.signed_url",
  ],
  hunter: [
    "client.read.own",
    "client.create",
    "client.update",
    "collateral.read",
    "collateral.calculate",
    "policy_params.read",
    "knowledge.read",
    "storage.upload",
    "storage.signed_url",
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @workspace/api-spec test
```

Expected: 4/4 pass.

- [ ] **Step 5: Export from package**

Edit `lib/api-spec/src/index.ts` (or create if missing) to add:

```ts
export * from "./permissions";
export * from "./role-permissions";
```

- [ ] **Step 6: Commit**

```bash
git add lib/api-spec/src/
git commit -m "feat(rbac): role->permissions map with tests"
```

### Task A4.3: requirePermission middleware

**Files:**
- Modify: `artifacts/api-server/src/middleware/auth.ts`
- Test: `artifacts/api-server/src/__tests__/permission-middleware.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// artifacts/api-server/src/__tests__/permission-middleware.test.ts
import { describe, it, expect, vi } from "vitest";
import { requirePermission } from "../middleware/auth";
import type { Request, Response, NextFunction } from "express";

function makeReq(role: string): Request {
  return { user: { id: 1, role } } as unknown as Request;
}
function makeRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe("requirePermission", () => {
  it("calls next() when role has permission", () => {
    const next = vi.fn();
    const mw = requirePermission("client.read.all");
    mw(makeReq("superadmin"), makeRes(), next as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });

  it("returns 403 when role lacks permission", () => {
    const next = vi.fn();
    const res = makeRes();
    const mw = requirePermission("client.delete");
    mw(makeReq("editor"), res, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when no user", () => {
    const next = vi.fn();
    const res = makeRes();
    const mw = requirePermission("client.read.own");
    mw({} as Request, res, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @workspace/api-server test permission-middleware
```

Expected: FAIL — `requirePermission` not exported.

- [ ] **Step 3: Add requirePermission to auth.ts**

In `artifacts/api-server/src/middleware/auth.ts`, add at the bottom of file (keep existing exports intact):

```ts
import { hasPermission, type Role, type Permission } from "@workspace/api-spec/role-permissions";

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user || !user.role) {
      return res.status(401).json({ error: "unauthenticated" });
    }
    if (!hasPermission(user.role as Role, permission)) {
      return res.status(403).json({ error: "forbidden", required: permission });
    }
    next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @workspace/api-server test permission-middleware
```

Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/middleware/auth.ts artifacts/api-server/src/__tests__/permission-middleware.test.ts
git commit -m "feat(rbac): add requirePermission middleware"
```

### Task A4.4: Audit pass — replace inline role checks

**Files:** every file that contains `user?.role ===` or `req.user.role ===` or similar.

- [ ] **Step 1: Find all current role-string checks**

```bash
git grep -nE "(role *=== *['\"])|(role *== *['\"])" artifacts/api-server/src
```

Expected: prints a list of locations. Save that list as input to Step 2.

- [ ] **Step 2: For each location, decide the right Permission**

Use this mapping cheat-sheet:

| Old check | New permission |
|---|---|
| `role === "superadmin"` | depends on action — most likely a write op → use the action's specific permission, do not gate on role |
| `role !== "branch_head"` | inverse of `client.read.branch` — usually expressing "all-branch reader" → `client.read.all` |
| `["superadmin","head_office_admin","editor"].includes(role)` | the specific action — usually `client.update` or `policy_params.update` |
| `role === "hunter"` | hunter is the only "own-data" role — `client.read.own` |

For each match: replace with `requirePermission("…")` middleware on the route, OR delete the inline check if the route now has middleware.

- [ ] **Step 3: After every file, run that route's tests**

For each file you change, run the relevant test file:

```bash
pnpm --filter @workspace/api-server test <test-file-name>
```

- [ ] **Step 4: Final scan should return zero hits**

```bash
git grep -nE "(role *=== *['\"])|(role *== *['\"])" artifacts/api-server/src
```

Expected: empty output.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src
git commit -m "refactor(rbac): replace inline role checks with requirePermission"
```

### Task A4.5: roles-and-permissions doc

**Files:**
- Create: `docs/roles-and-permissions.md`

- [ ] **Step 1: Generate doc programmatically**

Create `lib/api-spec/scripts/render-permissions-doc.ts`:

```ts
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROLE_PERMISSIONS, ROLES } from "../src/role-permissions";
import { PERMISSIONS } from "../src/permissions";

const cell = (has: boolean) => (has ? "✓" : "—");
const header = ["Permission", ...ROLES].join(" | ");
const sep = ["---", ...ROLES.map(() => "---")].join(" | ");
const rows = PERMISSIONS.map((p) => {
  const roleCells = ROLES.map((r) => cell(ROLE_PERMISSIONS[r].includes(p)));
  return [p, ...roleCells].join(" | ");
});

const md = [
  "# Roles and Permissions",
  "",
  "Auto-generated by `lib/api-spec/scripts/render-permissions-doc.ts`. Do not edit by hand.",
  "",
  `| ${header} |`,
  `| ${sep} |`,
  ...rows.map((r) => `| ${r} |`),
  "",
].join("\n");

writeFileSync(resolve(process.cwd(), "docs/roles-and-permissions.md"), md);
console.log("wrote docs/roles-and-permissions.md");
```

- [ ] **Step 2: Add npm script**

In `lib/api-spec/package.json` scripts:

```json
"render:permissions-doc": "tsx scripts/render-permissions-doc.ts"
```

- [ ] **Step 3: Run it from repo root**

```bash
pnpm --filter @workspace/api-spec run render:permissions-doc
```

Expected: prints "wrote docs/roles-and-permissions.md", file exists, table is well-formed.

- [ ] **Step 4: Commit**

```bash
git add docs/roles-and-permissions.md lib/api-spec/scripts/render-permissions-doc.ts lib/api-spec/package.json
git commit -m "docs(rbac): generate roles-and-permissions matrix"
```

### Task A4.6: PR + merge

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/rbac-matrix
```

- [ ] **Step 2: Open PR via gh**

```bash
gh pr create --base main --title "RBAC: Permission middleware + capability matrix" --body "Closes Phase A item #4. See docs/superpowers/specs/2026-05-05-minerva-changes-design.md §4 A4."
```

- [ ] **Step 3: Tag main before merge**

After review, before clicking merge:

```bash
git checkout main && git pull --ff-only
git tag -a v2.1.0-pre-rbac -m "Tag before RBAC merge"
git push origin v2.1.0-pre-rbac
```

- [ ] **Step 4: Merge PR**

Use the GitHub UI, or:

```bash
gh pr merge --merge --auto
```

---

## A1: PDF Leave-Behind Redesign

**Branch:** `feat/pdf-redesign` off `main` (after A4 merged).

### Task A1.1: Add bundled fonts

**Files:**
- Create: `artifacts/api-server/fonts/DejaVuSans.ttf`
- Create: `artifacts/api-server/fonts/DejaVuSans-Bold.ttf`
- Modify: `artifacts/api-server/.gitignore` (allow fonts dir)
- Modify: `artifacts/api-server/build.mjs` (copy fonts to dist)

- [ ] **Step 1: Download fonts**

DejaVuSans is GPL-licensed for unlimited redistribution. Download official tarball:

```bash
mkdir -p artifacts/api-server/fonts
curl -L -o /tmp/dejavu.tar.bz2 https://downloads.sourceforge.net/project/dejavu/dejavu/2.37/dejavu-fonts-ttf-2.37.tar.bz2
tar -xjf /tmp/dejavu.tar.bz2 -C /tmp
cp /tmp/dejavu-fonts-ttf-2.37/ttf/DejaVuSans.ttf artifacts/api-server/fonts/
cp /tmp/dejavu-fonts-ttf-2.37/ttf/DejaVuSans-Bold.ttf artifacts/api-server/fonts/
ls -lh artifacts/api-server/fonts/
```

Expected: two .ttf files, ~700KB each.

- [ ] **Step 2: Update build.mjs to copy fonts to dist**

In `artifacts/api-server/build.mjs`, after the esbuild call, add a copy step (preserve existing build logic — read the file first to find the right insertion point). The pattern:

```js
import { mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

// after build:
mkdirSync(resolve("dist/fonts"), { recursive: true });
for (const name of ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"]) {
  copyFileSync(resolve("fonts", name), resolve("dist/fonts", name));
}
```

- [ ] **Step 3: Verify build copies them**

```bash
pnpm --filter @workspace/api-server build
ls -lh artifacts/api-server/dist/fonts/
```

Expected: both .ttf files present in dist/fonts/.

- [ ] **Step 4: Commit**

```bash
git checkout -b feat/pdf-redesign main
git add artifacts/api-server/fonts/ artifacts/api-server/build.mjs
git commit -m "build(pdf): bundle DejaVuSans fonts in repo"
```

### Task A1.2: Force-load bundled fonts in PDF generator

**Files:**
- Modify: `artifacts/api-server/src/pdf/generate.ts` (font resolver, lines ~95–125 currently)
- Test: `artifacts/api-server/src/__tests__/pdf-fonts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// artifacts/api-server/src/__tests__/pdf-fonts.test.ts
import { describe, it, expect } from "vitest";
import { resolveBundledFonts } from "../pdf/generate";

describe("resolveBundledFonts", () => {
  it("returns the bundled font paths", () => {
    const fonts = resolveBundledFonts();
    expect(fonts.body).toMatch(/DejaVuSans\.ttf$/);
    expect(fonts.bold).toMatch(/DejaVuSans-Bold\.ttf$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @workspace/api-server test pdf-fonts
```

Expected: FAIL — `resolveBundledFonts` not exported.

- [ ] **Step 3: Replace OS font search with bundled-font resolver**

In `artifacts/api-server/src/pdf/generate.ts`, replace the existing `resolveFontCandidates` function with:

```ts
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

export function resolveBundledFonts(): { body: string; bold: string } {
  // Works in both dev (artifacts/api-server/fonts) and built dist (dist/fonts).
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../fonts"),       // dist/fonts when running built code
    resolve(here, "../../fonts"),    // src/pdf -> ../../fonts when running ts-node
  ];
  for (const dir of candidates) {
    const body = resolve(dir, "DejaVuSans.ttf");
    const bold = resolve(dir, "DejaVuSans-Bold.ttf");
    if (existsSync(body) && existsSync(bold)) return { body, bold };
  }
  throw new Error(
    "Bundled fonts not found. Run pnpm --filter @workspace/api-server build to copy fonts to dist/.",
  );
}
```

Update the registerFont call site in the same file to use this resolver instead of the OS-path one. Delete the `resolveFontCandidates` function and the OS-path arrays.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @workspace/api-server test pdf-fonts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/pdf/generate.ts artifacts/api-server/src/__tests__/pdf-fonts.test.ts
git commit -m "feat(pdf): force-load bundled DejaVuSans"
```

### Task A1.3: Add `phone` column to users

**Files:**
- Modify: `lib/db/src/schema/users.ts`
- Create: `lib/db/drizzle/0004_users_phone.sql` (drizzle will name it; this is the expected pattern)

- [ ] **Step 1: Add phone column to schema**

```ts
// lib/db/src/schema/users.ts — add to usersTable:
phone: text("phone"),
```

Insert just before `passwordHash`.

- [ ] **Step 2: Generate migration**

```bash
pnpm --filter @workspace/db drizzle-kit generate
```

Expected: a new migration file under `lib/db/drizzle/` adding the phone column.

- [ ] **Step 3: Apply locally**

```bash
pnpm --filter @workspace/db drizzle-kit migrate
```

- [ ] **Step 4: Update OpenAPI for User schema**

In `lib/api-spec/openapi.yaml`, locate the `User` schema and add:

```yaml
phone:
  type: string
  nullable: true
```

- [ ] **Step 5: Regenerate clients**

```bash
pnpm --filter @workspace/api-zod run generate
pnpm --filter @workspace/api-client-react run generate
```

- [ ] **Step 6: Commit**

```bash
git add lib/db/ lib/api-spec/openapi.yaml lib/api-zod/ lib/api-client-react/
git commit -m "feat(users): add phone column"
```

### Task A1.4: Phone field in admin user form

**Files:**
- Modify: `artifacts/admin/src/pages/users.tsx`

- [ ] **Step 1: Add phone input**

Find the user-create form fields and add a "phone" Input (mirrors the `name` input but for `phone`). Add corresponding label using existing translation pattern. Hook into the create/update mutations to include `phone`.

Minimal required change — find the existing `name` Input block and add immediately after:

```tsx
<div>
  <Label htmlFor="phone">{t("users.phone")}</Label>
  <Input
    id="phone"
    type="tel"
    value={form.phone ?? ""}
    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
    placeholder="+998 ..."
  />
</div>
```

Add translation strings in `artifacts/admin/src/i18n/ru.json` and `uz.json` under `users`:

```json
"phone": "Телефон"   // ru
"phone": "Telefon"   // uz
```

- [ ] **Step 2: Manual smoke test**

```bash
pnpm --filter @workspace/admin dev
```

Open `/admin/users`, create or edit a user, set phone, save, refresh, confirm phone persists.

- [ ] **Step 3: Commit**

```bash
git add artifacts/admin/src/pages/users.tsx artifacts/admin/src/i18n/
git commit -m "feat(users): phone input on admin user form"
```

### Task A1.5: New `generateLeaveBehindPdf` function

**Files:**
- Create: `artifacts/api-server/src/pdf/leave-behind.ts`
- Test: `artifacts/api-server/src/__tests__/leave-behind-pdf.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// artifacts/api-server/src/__tests__/leave-behind-pdf.test.ts
import { describe, it, expect } from "vitest";
import { generateLeaveBehindPdf } from "../pdf/leave-behind";

describe("generateLeaveBehindPdf", () => {
  it("returns a PDF buffer for a populated client+expert", async () => {
    const buf = await generateLeaveBehindPdf({
      client: { fullName: "Aziz Karimov", businessName: "Tea Trader" },
      expert: { name: "Bobur Tursunov", phone: "+998 90 123-45-67" },
      indicative: {
        amountMinUzs: 50_000_000,
        amountMaxUzs: 200_000_000,
        monthlyMinUzs: 2_500_000,
        monthlyMaxUzs: 9_000_000,
        currency: "UZS",
      },
      branchName: "IPAK YO'LI Chilonzor",
      language: "ru",
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
    // PDF magic bytes
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("renders with missing optional fields", async () => {
    const buf = await generateLeaveBehindPdf({
      client: { fullName: "Anonymous" },
      expert: { name: "Bobur", phone: "+998..." },
      indicative: null,
      branchName: "IPAK YO'LI",
      language: "ru",
    });
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @workspace/api-server test leave-behind-pdf
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// artifacts/api-server/src/pdf/leave-behind.ts
import PDFDocument from "pdfkit";
import { resolveBundledFonts } from "./generate";

const STRINGS = {
  ru: {
    title: "Индикативное предложение",
    client: "Клиент",
    business: "Бизнес",
    indicativeRange: "Ориентировочная сумма кредита",
    indicativePayment: "Примерный ежемесячный платёж",
    couldFinance: "Что вы могли бы профинансировать",
    couldFinanceList: "Пополнение оборотных средств, оборудование, развитие бизнеса.",
    expert: "Ваш кредитный эксперт",
    callMe: "Есть вопросы? Звоните мне напрямую:",
    continueOnline: "Продолжить заявку:",
    disclaimer:
      "Информация в данном документе носит ориентировочный характер. " +
      "Окончательные условия определяются кредитным комитетом банка.",
  },
  uz: {
    title: "Indikativ taklif",
    client: "Mijoz",
    business: "Biznes",
    indicativeRange: "Taxminiy kredit summasi",
    indicativePayment: "Taxminiy oylik to'lov",
    couldFinance: "Nimani moliyalashtirishingiz mumkin",
    couldFinanceList:
      "Aylanma mablag'ni to'ldirish, uskunalar, biznesni rivojlantirish.",
    expert: "Sizning kredit ekspertingiz",
    callMe: "Savollar bor? To'g'ridan-to'g'ri qo'ng'iroq qiling:",
    continueOnline: "Arizani davom ettirish:",
    disclaimer:
      "Ushbu hujjatdagi ma'lumotlar taxminiy xarakterga ega. " +
      "Yakuniy shartlar bank kredit qo'mitasi tomonidan belgilanadi.",
  },
} as const;

const TG_URL = "t.me/IpakYoliBot";

const fmtUzs = (n: number) =>
  new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " UZS";

export interface LeaveBehindInput {
  client: { fullName?: string | null; businessName?: string | null };
  expert: { name: string; phone: string };
  indicative: {
    amountMinUzs: number;
    amountMaxUzs: number;
    monthlyMinUzs: number;
    monthlyMaxUzs: number;
    currency: "UZS";
  } | null;
  branchName: string;
  language: "ru" | "uz";
}

export async function generateLeaveBehindPdf(
  input: LeaveBehindInput,
): Promise<Buffer> {
  const fonts = resolveBundledFonts();
  const t = STRINGS[input.language];

  const doc = new PDFDocument({
    size: "A4",
    margin: 36,
    info: {
      Title: t.title,
      Author: input.expert.name,
      Subject: `${input.client.fullName ?? ""} — ${input.branchName}`,
    },
  });

  doc.registerFont("body", fonts.body);
  doc.registerFont("bold", fonts.bold);

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done: Promise<Buffer> = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // ── Header ──
  doc.font("bold").fontSize(20).fillColor("#0F172A").text("IPAK YO'LI Bank");
  doc.moveDown(0.2);
  doc.font("body").fontSize(10).fillColor("#64748B").text(input.branchName);
  doc.moveDown(0.6);
  doc.font("bold").fontSize(14).fillColor("#16A34A").text(t.title);
  doc.moveDown(1);

  // ── Client info ──
  doc.font("body").fontSize(11).fillColor("#0F172A");
  doc.text(`${t.client}: `, { continued: true }).font("bold").text(input.client.fullName ?? "—");
  if (input.client.businessName) {
    doc.font("body").text(`${t.business}: `, { continued: true }).font("bold").text(input.client.businessName);
  }
  doc.moveDown(1);

  // ── Indicative range ──
  if (input.indicative) {
    doc.font("body").fontSize(11).fillColor("#64748B").text(t.indicativeRange);
    doc.font("bold").fontSize(15).fillColor("#0F172A")
      .text(`${fmtUzs(input.indicative.amountMinUzs)} – ${fmtUzs(input.indicative.amountMaxUzs)}`);
    doc.moveDown(0.5);
    doc.font("body").fontSize(11).fillColor("#64748B").text(t.indicativePayment);
    doc.font("bold").fontSize(13).fillColor("#0F172A")
      .text(`${fmtUzs(input.indicative.monthlyMinUzs)} – ${fmtUzs(input.indicative.monthlyMaxUzs)}`);
    doc.moveDown(1);
  }

  // ── What could be financed ──
  doc.font("bold").fontSize(11).fillColor("#0F172A").text(t.couldFinance);
  doc.font("body").fontSize(10).fillColor("#475569").text(t.couldFinanceList);
  doc.moveDown(1);

  // ── Expert block ──
  doc.rect(36, doc.y, 523, 70).fillAndStroke("#F0FDF4", "#16A34A");
  const boxY = doc.y - 70 + 12;
  doc.font("bold").fontSize(11).fillColor("#15803D").text(t.expert, 48, boxY);
  doc.font("bold").fontSize(14).fillColor("#0F172A").text(input.expert.name, 48, boxY + 16);
  doc.font("body").fontSize(11).fillColor("#475569").text(t.callMe, 48, boxY + 36);
  doc.font("bold").fontSize(13).fillColor("#16A34A").text(input.expert.phone, 48, boxY + 50);
  doc.y = boxY + 70 + 12;

  // ── Continue online ──
  doc.font("body").fontSize(10).fillColor("#64748B").text(`${t.continueOnline} ${TG_URL}`);
  doc.moveDown(2);

  // ── Disclaimer ──
  doc.font("body").fontSize(8).fillColor("#94A3B8")
    .text(t.disclaimer, { align: "justify" });

  doc.end();
  return done;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @workspace/api-server test leave-behind-pdf
```

Expected: 2/2 pass.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/pdf/leave-behind.ts artifacts/api-server/src/__tests__/leave-behind-pdf.test.ts
git commit -m "feat(pdf): leave-behind 1-page PDF generator"
```

### Task A1.6: Wire generator into POST /mini-app/clients/:id/generate-pdf

**Files:**
- Modify: `artifacts/api-server/src/routes/mini-app.ts` (or wherever the existing PDF endpoint is — locate via grep)

- [ ] **Step 1: Find the existing endpoint**

```bash
git grep -n "generate-pdf\|generatePdf\b\|POST.*pdf" artifacts/api-server/src/routes/
```

- [ ] **Step 2: Refactor the handler**

Replace the existing handler body (after auth + validation) with a call to `generateLeaveBehindPdf`:

```ts
import { generateLeaveBehindPdf } from "../pdf/leave-behind";

// Inside handler — after fetching client, expert (assignedTo user), and latest calculations:

const calcs = await db.select()
  .from(calculationsTable)
  .where(eq(calculationsTable.clientId, client.id))
  .orderBy(desc(calculationsTable.createdAt))
  .limit(20);

let indicative: LeaveBehindInput["indicative"] = null;
if (calcs.length > 0) {
  const amounts = calcs.map((c) => Number(c.loanAmount));
  const monthly = calcs.map((c) => Number(c.monthlyPayment));
  indicative = {
    amountMinUzs: Math.min(...amounts),
    amountMaxUzs: Math.max(...amounts),
    monthlyMinUzs: Math.min(...monthly),
    monthlyMaxUzs: Math.max(...monthly),
    currency: "UZS",
  };
}

const expert = client.assignedTo;
if (!expert?.name || !expert?.phone) {
  return res.status(400).json({
    error: "expert_missing_contact",
    message: "Assigned credit expert must have name and phone.",
  });
}

const branch = client.branch ?? { name: "IPAK YO'LI" };

const buf = await generateLeaveBehindPdf({
  client: { fullName: client.fullName, businessName: (client as any).businessName ?? null },
  expert: { name: expert.name, phone: expert.phone },
  indicative,
  branchName: branch.name,
  language: req.body.language === "uz" ? "uz" : "ru",
});

res.setHeader("Content-Type", "application/pdf");
res.setHeader("Content-Disposition", `attachment; filename="leave-behind-${client.id}.pdf"`);
res.send(buf);
```

- [ ] **Step 3: Update the existing PDF endpoint test**

If `pdf-helpers.test.ts` or similar covers the old multi-page generator, update or delete (depending on whether logic is shared). Run tests:

```bash
pnpm --filter @workspace/api-server test
```

Fix any failures by adjusting test fixtures.

- [ ] **Step 4: Manual end-to-end smoke**

```bash
pnpm --filter @workspace/api-server dev
# In another terminal:
curl -X POST http://localhost:3000/mini-app/clients/<some-id>/generate-pdf \
  -H "Content-Type: application/json" -d '{"language":"ru"}' --output /tmp/leave-behind.pdf
file /tmp/leave-behind.pdf       # expect "PDF document, version 1.x"
open /tmp/leave-behind.pdf       # macOS — visually inspect
```

Expected: PDF opens, shows bank header, client name, indicative range, expert name+phone box, Telegram URL line, disclaimer.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes
git commit -m "feat(pdf): use leave-behind generator on /generate-pdf endpoint"
```

### Task A1.7: PR + merge

- [ ] **Step 1: Push and PR**

```bash
git push -u origin feat/pdf-redesign
gh pr create --base main --title "PDF: 1-page leave-behind redesign" --body "Closes Phase A item #1."
```

- [ ] **Step 2: Tag main, merge**

```bash
git checkout main && git pull --ff-only
git tag -a v2.2.0-pre-pdf -m "Tag before PDF redesign merge"
git push origin v2.2.0-pre-pdf
gh pr merge --merge
```

---

## A2: Cloudflare R2 Storage Migration

**Branch:** `feat/storage-r2` off `main` (after A4).

### Task A2.1: Add @aws-sdk/client-s3 dependency

**Files:**
- Modify: `artifacts/api-server/package.json`

- [ ] **Step 1: Add dependency**

```bash
git checkout -b feat/storage-r2 main
pnpm --filter @workspace/api-server add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 2: Verify install**

```bash
pnpm --filter @workspace/api-server why @aws-sdk/client-s3 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/package.json pnpm-lock.yaml
git commit -m "chore(deps): add @aws-sdk/client-s3 for R2"
```

### Task A2.2: Schema additions to client_documents

**Files:**
- Modify: `lib/db/src/schema/mini-app.ts`

- [ ] **Step 1: Extend the table**

In `clientDocumentsTable`, add three columns:

```ts
mimeType: text("mime_type"),
sizeBytes: integer("size_bytes"),
deletedAt: timestamp("deleted_at"),
```

Place them right before the closing `}` of the column definitions, after `extractedData`.

- [ ] **Step 2: Document the canonical doc_type values**

Add a comment block above `clientDocumentsTable`:

```ts
// Canonical doc_type values (string column, no DB enum so legacy data flows through):
//   photo_storefront, photo_owner,
//   cadastre, vehicle_passport, business_license, financial_statement,
//   voice_note, consent_signature, other
```

- [ ] **Step 3: Generate + apply migration**

```bash
pnpm --filter @workspace/db drizzle-kit generate
pnpm --filter @workspace/db drizzle-kit migrate
```

- [ ] **Step 4: Update OpenAPI spec for client_documents response**

If the OpenAPI yaml exposes a ClientDocument schema, add the three fields.

- [ ] **Step 5: Regenerate clients**

```bash
pnpm --filter @workspace/api-zod run generate
pnpm --filter @workspace/api-client-react run generate
```

- [ ] **Step 6: Commit**

```bash
git add lib/db lib/api-spec lib/api-zod lib/api-client-react
git commit -m "feat(storage): add mime_type, size_bytes, deleted_at to client_documents"
```

### Task A2.3: R2 client wrapper

**Files:**
- Create: `artifacts/api-server/src/storage/r2-client.ts`
- Test: `artifacts/api-server/src/__tests__/r2-client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// artifacts/api-server/src/__tests__/r2-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed.example/key"),
}));

beforeEach(() => {
  process.env.R2_ACCOUNT_ID = "acct";
  process.env.R2_ACCESS_KEY_ID = "key";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  process.env.R2_BUCKET = "bucket";
  process.env.R2_PUBLIC_BASE_URL = "https://r2.example";
});

describe("R2Storage", () => {
  it("uploads with content type", async () => {
    const { R2Storage } = await import("../storage/r2-client");
    const r2 = new R2Storage();
    const url = await r2.upload({
      key: "clients/1/photo.jpg",
      body: Buffer.from("hi"),
      contentType: "image/jpeg",
    });
    expect(url).toContain("clients/1/photo.jpg");
  });

  it("returns a signed URL", async () => {
    const { R2Storage } = await import("../storage/r2-client");
    const r2 = new R2Storage();
    const url = await r2.signedUrl("clients/1/private.pdf", 900);
    expect(url).toBe("https://signed.example/key");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @workspace/api-server test r2-client
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// artifacts/api-server/src/storage/r2-client.ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function envOrThrow(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing env var: ${key}`);
  return v;
}

export class R2Storage {
  private client: S3Client;
  private bucket: string;
  private publicBaseUrl: string;

  constructor() {
    const accountId = envOrThrow("R2_ACCOUNT_ID");
    this.bucket = envOrThrow("R2_BUCKET");
    this.publicBaseUrl = envOrThrow("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: envOrThrow("R2_ACCESS_KEY_ID"),
        secretAccessKey: envOrThrow("R2_SECRET_ACCESS_KEY"),
      },
    });
  }

  async upload(opts: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: opts.key,
        Body: opts.body,
        ContentType: opts.contentType,
      }),
    );
    return `${this.publicBaseUrl}/${opts.key}`;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async signedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}

let _instance: R2Storage | null = null;
export function getR2(): R2Storage {
  if (!_instance) _instance = new R2Storage();
  return _instance;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @workspace/api-server test r2-client
```

Expected: 2/2 pass.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/storage/r2-client.ts artifacts/api-server/src/__tests__/r2-client.test.ts
git commit -m "feat(storage): R2 client wrapper"
```

### Task A2.4: Refactor upload route to use R2

**Files:**
- Modify: `artifacts/api-server/src/routes/storage.ts`

- [ ] **Step 1: Read existing handler**

```bash
sed -n '1,200p' artifacts/api-server/src/routes/storage.ts
```

- [ ] **Step 2: Rewrite upload-image handler**

Locate the `POST /storage/upload-image` route. Replace the file-write block with R2 upload. Pseudocode pattern (adapt to existing handler shape):

```ts
import { randomUUID } from "node:crypto";
import { getR2 } from "../storage/r2-client";
import { requirePermission } from "../middleware/auth";

router.post(
  "/upload-image",
  requirePermission("storage.upload"),
  async (req, res) => {
    const { dataUrl, clientId, docType } = req.body;
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl);
    if (!m) return res.status(400).json({ error: "bad_data_url" });
    const [, mimeType, b64] = m;
    const buf = Buffer.from(b64, "base64");
    if (buf.length > 12 * 1024 * 1024) return res.status(413).json({ error: "too_large" });

    const ext = mimeType.split("/")[1].replace("jpeg", "jpg");
    const key = `clients/${clientId}/${randomUUID()}.${ext}`;
    const url = await getR2().upload({ key, body: buf, contentType: mimeType });

    const [doc] = await db.insert(clientDocumentsTable).values({
      clientId: Number(clientId),
      userId: (req as any).user.id,
      docType: docType ?? "photo_storefront",
      fileName: key.split("/").pop()!,
      storagePath: key,
      mimeType,
      sizeBytes: buf.length,
    }).returning();

    res.json({ id: doc.id, url, key, mimeType, sizeBytes: buf.length });
  },
);
```

- [ ] **Step 3: Add the `upload-document` variant for non-image files**

Same shape, accept multipart via existing multer config; on receive, upload to R2 with `documents/${clientId}/${randomUUID()}.${ext}` key and `docType` from form field.

- [ ] **Step 4: Update existing signed-URL endpoint to use R2**

The endpoint `POST /storage/signed-url` already exists (callers send `{ path }`, get back `{ exp, sig }` or a URL). Replace its implementation:

```ts
// In artifacts/api-server/src/routes/storage.ts, replace the body of
// router.post("/storage/signed-url", ...):

router.post(
  "/storage/signed-url",
  requirePermission("storage.signed_url"),
  async (req: Request, res: Response) => {
    const { path } = req.body as { path?: string };
    if (!path) return res.status(400).json({ error: "missing_path" });

    // Backward compat: legacy "local-objects/..." paths still get the old signedURL
    // from createSignedObjectParams; new "clients/..." R2 keys get presigned R2 URLs.
    if (path.startsWith("local-objects/")) {
      const params = createSignedObjectParams(path);
      return res.json(params);
    }

    const url = await getR2().signedUrl(path, 900);
    return res.json({ url, expiresIn: 900 });
  },
);
```

Update `getSignedImageUrl` in `artifacts/mini-app/src/lib/api.ts` to handle the new response shape (return `data.url` if present, else build from `exp`+`sig` legacy).

- [ ] **Step 5: Run all storage tests**

```bash
pnpm --filter @workspace/api-server test storage
```

Fix any failing existing tests by mocking `getR2` (use `vi.mock("../storage/r2-client")` in test setup).

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/storage.ts
git commit -m "feat(storage): R2-backed upload endpoints"
```

### Task A2.5: Migrate existing local files to R2 (one-shot script)

**Files:**
- Create: `lib/db/scripts/migrate-uploads-to-r2.ts`

- [ ] **Step 1: Write migration script**

```ts
// lib/db/scripts/migrate-uploads-to-r2.ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db, clientDocumentsTable } from "../src/index";
import { eq, and, isNull, isNotNull, like } from "drizzle-orm";
import { getR2 } from "../../../artifacts/api-server/src/storage/r2-client";

async function main() {
  const localRoot = process.env.FILE_STORAGE_DIR ?? "./uploads";
  const docs = await db
    .select()
    .from(clientDocumentsTable)
    .where(
      and(
        isNotNull(clientDocumentsTable.storagePath),
        // existing local paths typically don't start with "clients/" — old ones started with "local-objects/" or similar
        like(clientDocumentsTable.storagePath, "local-objects/%"),
      ),
    );

  console.log(`migrating ${docs.length} docs`);
  const r2 = getR2();
  for (const doc of docs) {
    const localPath = resolve(localRoot, doc.storagePath);
    let buf: Buffer;
    try {
      buf = await readFile(localPath);
    } catch (e) {
      console.error(`skip ${doc.id}: cannot read ${localPath}`, (e as Error).message);
      continue;
    }
    const mimeType = doc.mimeType ?? "application/octet-stream";
    const ext = mimeType.split("/")[1] ?? "bin";
    const key = `clients/${doc.clientId}/migrated-${doc.id}.${ext}`;
    await r2.upload({ key, body: buf, contentType: mimeType });
    await db
      .update(clientDocumentsTable)
      .set({ storagePath: key, sizeBytes: buf.length })
      .where(eq(clientDocumentsTable.id, doc.id));
    console.log(`migrated doc ${doc.id} → ${key}`);
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

In `lib/db/package.json` scripts:

```json
"migrate:uploads-r2": "tsx scripts/migrate-uploads-to-r2.ts"
```

- [ ] **Step 3: Document run procedure**

Add to `docs/migrations.md`:

```
## R2 storage migration (2026-05)

Run once after deploying the R2-enabled api-server:

  R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... R2_PUBLIC_BASE_URL=... \
    pnpm --filter @workspace/db run migrate:uploads-r2

Idempotent: only migrates rows whose storage_path still starts with "local-objects/".
After completion, verify a sample row in admin client-detail loads its photo.
```

- [ ] **Step 4: Commit**

```bash
git add lib/db/scripts/migrate-uploads-to-r2.ts lib/db/package.json docs/migrations.md
git commit -m "chore(storage): migration script local-FS -> R2"
```

### Task A2.6: Mini-app photo gallery

**Files:**
- Modify: `artifacts/mini-app/src/pages/client-detail.tsx`
- Possibly create: `artifacts/mini-app/src/components/photo-gallery.tsx`

- [ ] **Step 1: Create gallery component**

```tsx
// artifacts/mini-app/src/components/photo-gallery.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, getSignedImageUrl } from "@/lib/api";

interface ClientDoc {
  id: number;
  storagePath: string;
  fileName: string;
  mimeType?: string | null;
  docType: string;
}

const PHOTO_TYPES = new Set(["photo_storefront", "photo_owner"]);

function GalleryImage({ doc, onPreview }: { doc: ClientDoc; onPreview: (url: string) => void }) {
  const isAbsolute = doc.storagePath.startsWith("http");
  const { data: signedUrl } = useQuery({
    queryKey: ["signed-image", doc.storagePath],
    queryFn: () => getSignedImageUrl(doc.storagePath),
    enabled: !isAbsolute,
    staleTime: 4 * 60 * 1000,
  });
  const src = isAbsolute ? doc.storagePath : signedUrl;
  if (!src) {
    return <div className="aspect-square rounded-xl bg-[#F1F5F9]" />;
  }
  return (
    <button
      onClick={() => onPreview(src)}
      className="aspect-square rounded-xl bg-[#F1F5F9] overflow-hidden"
    >
      <img src={src} alt={doc.fileName} className="w-full h-full object-cover" loading="lazy" />
    </button>
  );
}

export function PhotoGallery({ clientId }: { clientId: number }) {
  const [preview, setPreview] = useState<string | null>(null);
  const { data: docs = [] } = useQuery<ClientDoc[]>({
    queryKey: ["client-documents", clientId],
    queryFn: () => api.get(`/mini-app/clients/${clientId}/documents`),
  });
  const photos = docs.filter((d) => PHOTO_TYPES.has(d.docType));
  if (photos.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-3">
      {photos.map((p) => (
        <GalleryImage key={p.id} doc={p} onPreview={setPreview} />
      ))}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => setPreview(null)}
        >
          <img src={preview} alt="preview" className="max-w-full max-h-full" />
        </div>
      )}
    </div>
  );
}
```

Note: `getSignedImageUrl` already exists in `artifacts/mini-app/src/lib/api.ts` and resolves a storage key into a signed URL via the api-server. Reuse it; do not invent a new endpoint.

- [ ] **Step 2: Mount in client-detail**

In `artifacts/mini-app/src/pages/client-detail.tsx`, import `PhotoGallery` and place under the hero card (above the address/gender info card):

```tsx
import { PhotoGallery } from "@/components/photo-gallery";
// ...
<PhotoGallery clientId={Number(params.id)} />
```

- [ ] **Step 3: Document list (non-photo docs)**

Below the gallery, add a documents list section showing other doc types with a download / signed-URL link.

- [ ] **Step 4: Manual smoke**

Upload a photo via the existing scan flow → confirm it appears in the gallery, opens fullscreen on tap.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mini-app/src/
git commit -m "feat(mini-app): photo gallery + docs list on client detail"
```

### Task A2.7: Admin photo gallery

**Files:**
- Modify: `artifacts/admin/src/pages/client-detail.tsx`

- [ ] **Step 1: Mirror the mini-app gallery**

Use the same `client_documents` data source and same R2 keys. Admin can use a richer table layout if preferred. Reuse mini-app's filtering logic for `docType in PHOTO_TYPES`.

- [ ] **Step 2: Add delete button (gated by `storage.delete` permission)**

Show a trash icon on hover; on click, confirm + DELETE `/api/clients/:id/documents/:docId`. The api-server endpoint should soft-delete (set `deleted_at`) and async-delete the R2 object.

- [ ] **Step 3: Manual smoke**

Test as `editor` role (can delete) and as `branch_head` (cannot delete — should not see button).

- [ ] **Step 4: Commit**

```bash
git add artifacts/admin/src/pages/client-detail.tsx
git commit -m "feat(admin): photo gallery + docs list with permission-gated delete"
```

### Task A2.8: PR + merge

- [ ] **Step 1: Push, PR, tag, merge**

```bash
git push -u origin feat/storage-r2
gh pr create --base main --title "Storage: Cloudflare R2 migration" --body "Closes Phase A item #5."
git checkout main && git pull --ff-only
git tag -a v2.3.0-pre-r2 -m "Tag before R2 storage merge"
git push origin v2.3.0-pre-r2
gh pr merge --merge
```

- [ ] **Step 2: Run migration in production**

After deploy succeeds, run the migration script with prod env:

```bash
ssh railway-production-shell  # or use Railway CLI
pnpm --filter @workspace/db run migrate:uploads-r2
```

- [ ] **Step 3: Verify**

Open admin → some client with old photos → confirm photos load. Spot-check 5 clients.

---

## A3: Espo Outbound Sync

**Branch:** `feat/espo-sync` off `main` (after A4).

### Task A3.1: Add graphile-worker dependency

- [ ] **Step 1: Install**

```bash
git checkout -b feat/espo-sync main
pnpm --filter @workspace/api-server add graphile-worker
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/api-server/package.json pnpm-lock.yaml
git commit -m "chore(deps): add graphile-worker"
```

### Task A3.2: Schema — espo_sync_jobs + clients additions

**Files:**
- Create: `lib/db/src/schema/espo-sync-jobs.ts`
- Modify: `lib/db/src/schema/clients.ts`
- Modify: `lib/db/src/schema/index.ts`

- [ ] **Step 1: New table**

```ts
// lib/db/src/schema/espo-sync-jobs.ts
import { pgTable, serial, text, integer, timestamp, jsonb, index, uuid } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const espoSyncJobsTable = pgTable("espo_sync_jobs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  idempotencyKey: uuid("idempotency_key").notNull(),
  status: text("status").notNull().default("pending"), // pending | succeeded | failed
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  payloadSnapshot: jsonb("payload_snapshot"),
  espoLeadId: text("espo_lead_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("espo_jobs_status_idx").on(table.status),
  index("espo_jobs_client_id_idx").on(table.clientId),
  index("espo_jobs_idempotency_idx").on(table.idempotencyKey),
]);

export type EspoSyncJob = typeof espoSyncJobsTable.$inferSelect;
```

- [ ] **Step 2: Extend clients**

In `lib/db/src/schema/clients.ts`, add inside `clientsTable`:

```ts
externalUuid: uuid("external_uuid").notNull().defaultRandom().unique(),
espoLeadId: text("espo_lead_id"),
espoSyncedAt: timestamp("espo_synced_at"),
espoLastError: text("espo_last_error"),
```

Import `uuid` from `drizzle-orm/pg-core` (add to existing import line).

- [ ] **Step 3: Re-export from index**

In `lib/db/src/schema/index.ts`, add:

```ts
export * from "./espo-sync-jobs";
```

- [ ] **Step 4: Generate + apply migration**

```bash
pnpm --filter @workspace/db drizzle-kit generate
pnpm --filter @workspace/db drizzle-kit migrate
```

For existing rows: `external_uuid` is `NOT NULL DEFAULT gen_random_uuid()`. Drizzle will populate. Verify:

```sql
SELECT count(*) FROM clients WHERE external_uuid IS NULL;
-- expect 0
```

- [ ] **Step 5: Commit**

```bash
git add lib/db
git commit -m "feat(espo): schema for sync jobs + clients.external_uuid"
```

### Task A3.3: Espo client interface (stub-or-live)

**Files:**
- Create: `artifacts/api-server/src/integrations/espo/types.ts`
- Create: `artifacts/api-server/src/integrations/espo/client.ts`
- Test: `artifacts/api-server/src/__tests__/espo-client.test.ts`

- [ ] **Step 1: Types**

```ts
// artifacts/api-server/src/integrations/espo/types.ts
export interface EspoLeadPayload {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phone?: string;
  status?: string;          // "New" | "Assigned" | ...
  source?: string;
  description?: string;
  assignedUserId?: string;
  // Custom field — defends against Espo not honoring idempotency header.
  cLocalLeadUuid: string;
}

export interface EspoLeadResponse {
  id: string;
  name?: string;
  status?: string;
  cLocalLeadUuid?: string;
}

export interface EspoClient {
  createLead(p: EspoLeadPayload, idempotencyKey: string): Promise<EspoLeadResponse>;
  findLeadByLocalUuid(localUuid: string): Promise<EspoLeadResponse | null>;
}
```

- [ ] **Step 2: Stub + live implementation**

```ts
// artifacts/api-server/src/integrations/espo/client.ts
import { EspoClient, EspoLeadPayload, EspoLeadResponse } from "./types";

class StubEspoClient implements EspoClient {
  async createLead(p: EspoLeadPayload, idempotencyKey: string): Promise<EspoLeadResponse> {
    return { id: `stub-${idempotencyKey}`, name: p.fullName, status: "New", cLocalLeadUuid: p.cLocalLeadUuid };
  }
  async findLeadByLocalUuid(): Promise<EspoLeadResponse | null> {
    return null;
  }
}

class LiveEspoClient implements EspoClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async req<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`Espo ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async createLead(p: EspoLeadPayload, idempotencyKey: string): Promise<EspoLeadResponse> {
    return this.req("/api/v1/Lead", {
      method: "POST",
      body: JSON.stringify(p),
      headers: { "X-Idempotency-Key": idempotencyKey },
    });
  }

  async findLeadByLocalUuid(localUuid: string): Promise<EspoLeadResponse | null> {
    const r = await this.req<{ list: EspoLeadResponse[] }>(
      `/api/v1/Lead?where[0][type]=equals&where[0][attribute]=cLocalLeadUuid&where[0][value]=${encodeURIComponent(localUuid)}`,
      { method: "GET" },
    );
    return r.list[0] ?? null;
  }
}

let _client: EspoClient | null = null;
export function getEspoClient(): EspoClient {
  if (_client) return _client;
  const mode = process.env.ESPO_INTEGRATION ?? "stub";
  if (mode === "live") {
    const baseUrl = process.env.ESPO_BASE_URL;
    const apiKey = process.env.ESPO_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error("ESPO_INTEGRATION=live requires ESPO_BASE_URL and ESPO_API_KEY");
    }
    _client = new LiveEspoClient(baseUrl, apiKey);
  } else {
    _client = new StubEspoClient();
  }
  return _client;
}

// for tests
export function _resetEspoClientForTests() {
  _client = null;
}
```

- [ ] **Step 3: Test**

```ts
// artifacts/api-server/src/__tests__/espo-client.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { getEspoClient, _resetEspoClientForTests } from "../integrations/espo/client";

describe("getEspoClient", () => {
  beforeEach(() => {
    _resetEspoClientForTests();
    delete process.env.ESPO_INTEGRATION;
  });

  it("defaults to stub", async () => {
    const c = getEspoClient();
    const r = await c.createLead({ cLocalLeadUuid: "abc-123", fullName: "X" }, "abc-123");
    expect(r.id).toBe("stub-abc-123");
  });

  it("throws if live without creds", () => {
    process.env.ESPO_INTEGRATION = "live";
    expect(() => getEspoClient()).toThrow();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @workspace/api-server test espo-client
```

Expected: 2/2 pass.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/integrations/espo/ artifacts/api-server/src/__tests__/espo-client.test.ts
git commit -m "feat(espo): stub + live client interface"
```

### Task A3.4: Payload mapper (clientToEspoLead)

**Files:**
- Create: `artifacts/api-server/src/integrations/espo/payload.ts`
- Test: `artifacts/api-server/src/__tests__/espo-payload.test.ts`

- [ ] **Step 1: Test**

```ts
// artifacts/api-server/src/__tests__/espo-payload.test.ts
import { describe, it, expect } from "vitest";
import { clientToEspoLead } from "../integrations/espo/payload";

describe("clientToEspoLead", () => {
  it("splits fullName into first/last", () => {
    const p = clientToEspoLead({
      id: 1,
      externalUuid: "uuid-1",
      fullName: "Aziz Karimov",
      phone: "+998 90 123-45-67",
      branch: { name: "Chilonzor" },
    } as any);
    expect(p.firstName).toBe("Aziz");
    expect(p.lastName).toBe("Karimov");
    expect(p.phone).toBe("+998 90 123-45-67");
    expect(p.cLocalLeadUuid).toBe("uuid-1");
    expect(p.source).toBe("Minerva");
  });

  it("handles single-name", () => {
    const p = clientToEspoLead({ id: 2, externalUuid: "u2", fullName: "Anonymous" } as any);
    expect(p.firstName).toBe("Anonymous");
    expect(p.lastName).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// artifacts/api-server/src/integrations/espo/payload.ts
import type { Client } from "@workspace/db";
import type { EspoLeadPayload } from "./types";

export function clientToEspoLead(client: Client & { branch?: { name: string } | null }): EspoLeadPayload {
  const parts = (client.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
  return {
    firstName,
    lastName,
    fullName: client.fullName ?? undefined,
    phone: client.phone ?? undefined,
    status: "New",
    source: "Minerva",
    description: client.branch?.name ? `Branch: ${client.branch.name}` : undefined,
    cLocalLeadUuid: client.externalUuid,
  };
}
```

- [ ] **Step 3: Run test**

```bash
pnpm --filter @workspace/api-server test espo-payload
```

Expected: 2/2 pass.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/integrations/espo/payload.ts artifacts/api-server/src/__tests__/espo-payload.test.ts
git commit -m "feat(espo): clientToEspoLead payload mapper"
```

### Task A3.5: graphile-worker setup

**Files:**
- Create: `artifacts/api-server/src/jobs/index.ts`
- Create: `artifacts/api-server/src/jobs/espo-sync.ts`
- Modify: `artifacts/api-server/package.json` (scripts: `worker`, `worker:install`)

- [ ] **Step 1: Worker entrypoint**

```ts
// artifacts/api-server/src/jobs/index.ts
import { run } from "graphile-worker";
import { espoSync } from "./espo-sync";

async function main() {
  const runner = await run({
    connectionString: process.env.DATABASE_URL!,
    concurrency: 4,
    pollInterval: 2000,
    taskList: {
      "espo-sync": espoSync,
    },
  });
  await runner.promise;
}

main().catch((e) => {
  console.error("worker fatal:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Espo sync task**

```ts
// artifacts/api-server/src/jobs/espo-sync.ts
import type { Task } from "graphile-worker";
import { db } from "@workspace/db";
import { clientsTable, espoSyncJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getEspoClient } from "../integrations/espo/client";
import { clientToEspoLead } from "../integrations/espo/payload";

interface Payload { jobId: number; }

export const espoSync: Task = async (payload, helpers) => {
  const { jobId } = payload as Payload;
  const [job] = await db.select().from(espoSyncJobsTable).where(eq(espoSyncJobsTable.id, jobId));
  if (!job || job.status === "succeeded") return;

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, job.clientId));
  if (!client) {
    await db.update(espoSyncJobsTable).set({ status: "failed", lastError: "client_not_found" }).where(eq(espoSyncJobsTable.id, jobId));
    return;
  }

  const espo = getEspoClient();

  // Idempotency: check if already exists in Espo by local uuid
  const existing = await espo.findLeadByLocalUuid(client.externalUuid);
  let espoLead;
  if (existing) {
    espoLead = existing;
  } else {
    const payload = clientToEspoLead(client as any);
    espoLead = await espo.createLead(payload, client.externalUuid);
  }

  await db.transaction(async (tx) => {
    await tx.update(clientsTable).set({
      espoLeadId: espoLead.id,
      espoSyncedAt: new Date(),
      espoLastError: null,
    }).where(eq(clientsTable.id, client.id));
    await tx.update(espoSyncJobsTable).set({
      status: "succeeded",
      attempts: job.attempts + 1,
      espoLeadId: espoLead.id,
      lastError: null,
    }).where(eq(espoSyncJobsTable.id, jobId));
  });

  helpers.logger.info(`espo synced client=${client.id} lead=${espoLead.id}`);
};
```

- [ ] **Step 3: Add scripts to package.json**

```json
"worker": "node --enable-source-maps ./dist/jobs/index.mjs",
"worker:install": "graphile-worker --connection $DATABASE_URL --schema-only"
```

- [ ] **Step 4: Update build.mjs to bundle the worker entrypoint**

In `artifacts/api-server/build.mjs`, add a second esbuild entry: `src/jobs/index.ts` → `dist/jobs/index.mjs`.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/jobs artifacts/api-server/package.json artifacts/api-server/build.mjs
git commit -m "feat(espo): graphile-worker process for espo sync"
```

### Task A3.6: Wire client save → enqueue Espo job

**Files:**
- Modify: `artifacts/api-server/src/routes/mini-app.ts` (the POST clients handler) and/or `routes/clients.ts`

- [ ] **Step 1: Find client-create handler**

```bash
git grep -nE "POST.*clients|router\.post.*clients" artifacts/api-server/src/routes/
```

- [ ] **Step 2: After insert, enqueue job**

```ts
import { quickAddJob } from "graphile-worker";
import { espoSyncJobsTable } from "@workspace/db";

// after inserting newClient:
const [job] = await db.insert(espoSyncJobsTable).values({
  clientId: newClient.id,
  idempotencyKey: newClient.externalUuid,
}).returning();

await quickAddJob(
  { connectionString: process.env.DATABASE_URL! },
  "espo-sync",
  { jobId: job.id },
  { jobKey: `espo-${newClient.externalUuid}`, maxAttempts: 10 },
);
```

- [ ] **Step 3: Test that save still completes <500ms**

Manual smoke: time a POST to `/mini-app/clients` and confirm response < 500ms.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes
git commit -m "feat(espo): enqueue sync job on client save"
```

### Task A3.7: Admin "Espo sync errors" panel

**Files:**
- Create: `artifacts/admin/src/pages/espo-sync.tsx`
- Modify: `artifacts/admin/src/App.tsx` (add route)
- Modify: `artifacts/admin/src/components/layout/sidebar.tsx` (add nav link)
- New endpoint: `GET /admin/espo-sync/jobs?status=...`
- New endpoint: `POST /admin/espo-sync/retry/:id`

- [ ] **Step 1: Backend endpoints**

In `artifacts/api-server/src/routes/admin.ts` (or new `routes/admin-espo.ts`):

```ts
router.get(
  "/espo-sync/jobs",
  requirePermission("espo.view_sync"),
  async (req, res) => {
    const status = String(req.query.status ?? "failed");
    const rows = await db
      .select()
      .from(espoSyncJobsTable)
      .where(eq(espoSyncJobsTable.status, status))
      .orderBy(desc(espoSyncJobsTable.updatedAt))
      .limit(100);
    res.json(rows);
  },
);

router.post(
  "/espo-sync/retry/:id",
  requirePermission("espo.retry_sync"),
  async (req, res) => {
    const jobId = Number(req.params.id);
    await quickAddJob(
      { connectionString: process.env.DATABASE_URL! },
      "espo-sync",
      { jobId },
      { maxAttempts: 1 },
    );
    res.json({ enqueued: true });
  },
);
```

- [ ] **Step 2: Admin page**

```tsx
// artifacts/admin/src/pages/espo-sync.tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { buildApiUrl } from "@/lib/api";
import { buildAuthHeaders, buildJsonHeaders } from "@/lib/auth-headers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

export default function EspoSyncPage() {
  const [status, setStatus] = useState("failed");
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["espo-sync-jobs", status],
    queryFn: () =>
      fetch(buildApiUrl(`/admin/espo-sync/jobs?status=${status}`), { headers: buildAuthHeaders() })
        .then((r) => r.json()),
  });
  const retry = useMutation({
    mutationFn: (id: number) =>
      fetch(buildApiUrl(`/admin/espo-sync/retry/${id}`), { method: "POST", headers: buildJsonHeaders() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["espo-sync-jobs"] }),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Espo Sync</h2>
      <div className="flex gap-2">
        {["pending", "failed", "succeeded"].map((s) => (
          <Button key={s} variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
            {s}
          </Button>
        ))}
      </div>
      <table className="w-full text-sm border">
        <thead className="bg-muted">
          <tr><th>ID</th><th>Client</th><th>Attempts</th><th>Error</th><th>Action</th></tr>
        </thead>
        <tbody>
          {data.map((row: any) => (
            <tr key={row.id} className="border-b">
              <td>{row.id}</td>
              <td>{row.clientId}</td>
              <td>{row.attempts}</td>
              <td className="text-red-600 max-w-md truncate">{row.lastError}</td>
              <td>
                {status === "failed" && (
                  <Button size="sm" onClick={() => retry.mutate(row.id)}>Retry</Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Wire route + sidebar entry**

Add to `App.tsx`:

```tsx
<Route path="/espo-sync" component={EspoSyncPage} />
```

Add to sidebar.tsx the nav link, gated by `espo.view_sync`.

- [ ] **Step 4: Manual smoke**

Stop the worker process, save a client → confirm a row appears under `pending`. Restart worker → row moves to `succeeded`.

Force a failure: set ESPO_INTEGRATION=live without creds, save a client → row should hit failed.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes artifacts/admin/src
git commit -m "feat(espo): admin sync errors panel + retry"
```

### Task A3.8: Worker as a Railway service

**Files:**
- Create: `artifacts/api-server/railway.worker.toml` (or document in railway.toml)
- Update: `docs/railway-deployment.md`

- [ ] **Step 1: Document service config**

In `docs/railway-deployment.md`, add a section:

```
## Worker service

The api-server image is reused. Service-level overrides in Railway:
- Name: `@workspace/worker`
- Start command: `node --enable-source-maps dist/jobs/index.mjs`
- Healthcheck: none (long-running process)
- Same DATABASE_URL, ESPO_*, R2_* envs as api-server.
```

- [ ] **Step 2: Provision via Railway dashboard**

(Manual user step — no code change. After A3 ships, add a service in Railway pointing at the same repo + image with the worker start command.)

- [ ] **Step 3: Commit**

```bash
git add docs/railway-deployment.md artifacts/api-server/railway.worker.toml
git commit -m "docs(deploy): worker service runbook"
```

### Task A3.9: PR + merge

```bash
git push -u origin feat/espo-sync
gh pr create --base main --title "Espo: outbound sync (stub mode)" --body "Closes Phase A item #6 (stub). Live mode flips ESPO_INTEGRATION=live + creds."
git checkout main && git pull --ff-only
git tag -a v2.4.0-pre-espo -m "Tag before Espo merge"
git push origin v2.4.0-pre-espo
gh pr merge --merge
```

---

## Final Integration Smoke

### Task Z.1: End-to-end smoke on Railway

- [ ] **Step 1: Save a lead in mini-app**

- Open Telegram → bot → mini-app
- Create a new client (use a test phone)
- Confirm response < 1s

- [ ] **Step 2: Verify Espo sync**

- Open admin → Espo Sync page
- Confirm a row appears as `pending` → `succeeded` within 30s
- (In stub mode, espoLeadId starts with `stub-`)

- [ ] **Step 3: Upload a photo**

- In mini-app client detail → upload photo
- Confirm gallery shows the photo within 2s
- Open admin → same client → confirm gallery shows the same photo
- Trigger a Railway redeploy → confirm photo still loads after redeploy

- [ ] **Step 4: Generate a PDF**

- In mini-app client detail → "Generate PDF"
- Confirm < 2s response
- Open the PDF — verify Cyrillic renders, expert name+phone visible

- [ ] **Step 5: RBAC sanity**

- Log in as `branch_head` → confirm only own-branch clients visible
- Try to access admin → Espo Sync → confirm visible (branch_head has `espo.view_sync`)
- Try to retry a failed job → confirm 403 (branch_head lacks `espo.retry_sync`)

- [ ] **Step 6: Document any issues + file follow-ups**

Open issues in GitHub for any anomalies found. Phase A is "done" when steps 1–5 all pass.

---

## Self-Review Checklist (run before declaring complete)

1. **Spec coverage**
   - [ ] A1 PDF redesign — Tasks A1.1–A1.7
   - [ ] A2 R2 storage — Tasks A2.1–A2.8
   - [ ] A3 Espo sync — Tasks A3.1–A3.9
   - [ ] A4 RBAC — Tasks A4.1–A4.6
   - [ ] Branch + tag + rollback strategy — embedded in each item's PR step
   - [ ] DB schema additions documented — `external_uuid`, `espo_*`, `users.phone`, `client_documents.{mime_type, size_bytes, deleted_at}`, `espo_sync_jobs`

2. **Acceptance criteria from spec § 11**
   - [ ] Cyrillic renders in PDF on Railway → A1.6 manual smoke
   - [ ] Photo survives redeploy → Z.1 step 3
   - [ ] Espo stub→live switch → A3.3 + Z.1 step 2
   - [ ] All routes use Permission middleware → A4.4 final grep returns empty

3. **Type/name consistency**
   - [ ] `requirePermission(p)` used consistently
   - [ ] `external_uuid` (DB) ↔ `externalUuid` (TS) ↔ `cLocalLeadUuid` (Espo) — three names, one identity. Documented in A3.3 types.

4. **Operational risks**
   - [ ] Worker process — A3.8 provisioning runbook
   - [ ] R2 migration — A2.5 idempotent script

5. **Out of scope confirmed**
   - [ ] Phase B/C/D items have separate plans (per spec § 14)
   - [ ] Bidirectional Espo sync deferred to Phase D

---

*End of Phase A plan. Phase B plan to be written closer to start date.*
