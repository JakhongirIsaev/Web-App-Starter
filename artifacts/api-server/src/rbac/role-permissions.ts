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
