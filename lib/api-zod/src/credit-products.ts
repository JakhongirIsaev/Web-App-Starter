/**
 * Zod schemas for credit-product endpoints.
 * Used by artifacts/api-server/src/routes/credit-products.ts for body validation.
 */
import { z } from "zod";

/**
 * POST /api/credit-products — create a new credit product.
 * `name` is the only required field (matches DB NOT NULL constraint).
 * All other columns are nullable in the DB, so they are optional here.
 */
export const CreateCreditProductBody = z.object({
  name: z.string().min(1, "Name is required"),
  number: z.number().int().optional(),
  sapCode: z.string().optional(),
  segment: z.string().optional(),
  disbursementForm: z.string().optional(),
  loanAmount: z.string().optional(),
  termWorkingCapital: z.string().optional(),
  termFixedAssets: z.string().optional(),
  termUntargeted: z.string().optional(),
  rateUZS: z.string().optional(),
  rateUSD: z.string().optional(),
  rateEUR: z.string().optional(),
  gracePeriod: z.string().optional(),
  purpose: z.string().optional(),
  highlight: z.string().optional(),
});

/**
 * PUT /api/credit-products/:id — update an existing credit product.
 * All fields are optional (partial update). `isActive` is also updatable.
 */
export const UpdateCreditProductBody = z.object({
  name: z.string().min(1).optional(),
  number: z.number().int().optional(),
  sapCode: z.string().optional(),
  segment: z.string().optional(),
  disbursementForm: z.string().optional(),
  loanAmount: z.string().optional(),
  termWorkingCapital: z.string().optional(),
  termFixedAssets: z.string().optional(),
  termUntargeted: z.string().optional(),
  rateUZS: z.string().optional(),
  rateUSD: z.string().optional(),
  rateEUR: z.string().optional(),
  gracePeriod: z.string().optional(),
  purpose: z.string().optional(),
  highlight: z.string().optional(),
  isActive: z.boolean().optional(),
});
