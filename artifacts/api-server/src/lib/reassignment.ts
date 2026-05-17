import { db } from "@workspace/db";
import { usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";

type ReassignmentValidationError =
  | "user_not_found"
  | "user_inactive"
  | "user_role_disallowed"
  | "branch_mismatch";

interface ReassignmentValidationResult {
  ok: boolean;
  error?: ReassignmentValidationError;
  message?: string;
}

const ASSIGNABLE_ROLES = new Set(["hunter", "branch_head"]);

/**
 * Pure validation against an already-fetched user row.
 * Split from the I/O variant so unit tests don't need a database.
 */
export function validateReassignmentForUser(
  target: User | undefined,
  clientBranchId: number | null,
): ReassignmentValidationResult {
  if (!target) {
    return { ok: false, error: "user_not_found", message: "Foydalanuvchi topilmadi / Пользователь не найден" };
  }
  if (!target.isActive) {
    return { ok: false, error: "user_inactive", message: "Foydalanuvchi faol emas / Пользователь неактивен" };
  }
  if (!ASSIGNABLE_ROLES.has(target.role)) {
    return {
      ok: false,
      error: "user_role_disallowed",
      message: "Mijozni bu rolga biriktirib bo'lmaydi / Клиент не может быть назначен на эту роль",
    };
  }
  if (clientBranchId !== null && target.branchId !== null && target.branchId !== clientBranchId) {
    return {
      ok: false,
      error: "branch_mismatch",
      message: "Foydalanuvchining filiali mijoznikidan farq qiladi / Филиал пользователя не совпадает с филиалом клиента",
    };
  }
  return { ok: true };
}

/**
 * TX-aware variant. Use inside `db.transaction(async (tx) => ...)` so the
 * SELECT and the subsequent UPDATE see a consistent snapshot — closes the
 * race window where a user is deactivated between the validate() and the
 * actual assignedToId write.
 */
export async function validateReassignmentInTx(
  tx: {
    select: typeof db.select;
  },
  targetUserId: number,
  clientBranchId: number | null,
): Promise<ReassignmentValidationResult> {
  const [target] = await tx
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, targetUserId))
    .limit(1);

  return validateReassignmentForUser(target, clientBranchId);
}
