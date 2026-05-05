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
