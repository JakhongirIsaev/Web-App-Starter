const ENDPOINTS = {
  api: "https://workspaceapi-server-production-fce2.up.railway.app",
  admin: "https://workspaceadmin-production-7e8d.up.railway.app",
  miniApp: "https://workspacemini-app-production.up.railway.app",
};

async function request(url, options = {}) {
  const res = await fetch(url, { redirect: "manual", ...options });
  const text = await res.text();
  return { status: res.status, location: res.headers.get("location"), text };
}

async function requestJson(url, options = {}) {
  const res = await request(url, {
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });

  try {
    return { ...res, json: JSON.parse(res.text) };
  } catch {
    return { ...res, json: null };
  }
}

function mainAsset(html) {
  return html.match(/<script[^>]+src="([^"]*\/assets\/index-[^"]+\.js)"/)?.[1] ?? null;
}

async function assetContains(origin, html, needles) {
  const asset = mainAsset(html);
  if (!asset) {
    return { asset: null, checks: Object.fromEntries(needles.map((needle) => [needle, false])) };
  }

  const assetUrls = [new URL(asset, origin).toString()];
  const entry = await request(assetUrls[0]);
  for (const match of entry.text.matchAll(/"(assets\/[^"]+\.js)"/g)) {
    assetUrls.push(new URL(match[1], origin).toString());
  }

  let joined = entry.text;
  for (const assetUrl of [...new Set(assetUrls.slice(1))]) {
    joined += "\n" + (await request(assetUrl)).text;
  }

  return {
    asset,
    checks: Object.fromEntries(needles.map((needle) => [needle, joined.includes(needle)])),
  };
}

function print(name, value) {
  console.log(`${name.padEnd(34)} ${value}`);
}

function collectionLength(value) {
  if (Array.isArray(value)) return value.length;
  if (Array.isArray(value?.data)) return value.data.length;
  if (Array.isArray(value?.users)) return value.users.length;
  if (Array.isArray(value?.items)) return value.items.length;
  return null;
}

const failures = [];
function expect(name, condition, details = "") {
  if (!condition) failures.push(`${name}${details ? `: ${details}` : ""}`);
}

const apiHealth = await request(`${ENDPOINTS.api}/api/healthz`);
const apiVersion = await request(`${ENDPOINTS.api}/api/version`);
const admin = await request(`${ENDPOINTS.admin}/`);
const miniApp = await request(`${ENDPOINTS.miniApp}/`);
const apiHostedAdmin = await request(`${ENDPOINTS.api}/admin/`);
const apiHostedMini = await request(`${ENDPOINTS.api}/mini-app/`);
const demoLogin = await requestJson(`${ENDPOINTS.api}/api/auth/login`, {
  method: "POST",
  body: JSON.stringify({ telegramId: "demo", password: "demo" }),
});

const adminAsset = await assetContains(ENDPOINTS.admin, admin.text, ["/accesses", "branch_head", "/clients/new"]);
const miniAsset = await assetContains(ENDPOINTS.miniApp, miniApp.text, ["demo", "auth/guest"]);
const token = demoLogin.json?.token;
const demoUsers = token
  ? await requestJson(`${ENDPOINTS.api}/api/users`, { headers: { Authorization: `Bearer ${token}` } })
  : null;
const demoClients = token
  ? await requestJson(`${ENDPOINTS.api}/api/mini-app/clients`, { headers: { Authorization: `Bearer ${token}` } })
  : null;

print("API /healthz", `${apiHealth.status} ${apiHealth.text.trim()}`);
print("API /version", `${apiVersion.status} ${apiVersion.text.trim()}`);
print("Standalone admin", `${admin.status} ${adminAsset.asset ?? "no asset"}`);
print("Standalone mini-app", `${miniApp.status} ${miniAsset.asset ?? "no asset"}`);
print("API-hosted /admin/", `${apiHostedAdmin.status} -> ${apiHostedAdmin.location ?? "no redirect"}`);
print("API-hosted /mini-app/", `${apiHostedMini.status} -> ${apiHostedMini.location ?? "no redirect"}`);
print("Admin contains /accesses", adminAsset.checks["/accesses"]);
print("Admin allows branch_head access", adminAsset.checks.branch_head);
print("Admin has /clients/new redirect", adminAsset.checks["/clients/new"]);
print("Mini-app has demo login", miniAsset.checks.demo);
print("Mini-app still calls /auth/guest", miniAsset.checks["auth/guest"]);
print("Demo login", `${demoLogin.status} ${demoLogin.json?.user?.role ?? "no user"}`);
print("Demo /api/users access", `${demoUsers?.status ?? "skipped"} ${collectionLength(demoUsers?.json) ?? "unknown"} users`);
print("Demo mini-app clients", `${demoClients?.status ?? "skipped"} ${collectionLength(demoClients?.json) ?? "unknown"} clients`);

expect("API /healthz", apiHealth.status === 200, `${apiHealth.status}`);
expect("API /version", apiVersion.status === 200, `${apiVersion.status}`);
expect("standalone admin loads", admin.status === 200, `${admin.status}`);
expect("standalone mini-app loads", miniApp.status === 200, `${miniApp.status}`);
expect("API-hosted /admin/ redirects", apiHostedAdmin.status === 308 && apiHostedAdmin.location?.startsWith(ENDPOINTS.admin), `${apiHostedAdmin.status} ${apiHostedAdmin.location ?? ""}`);
expect("API-hosted /mini-app/ redirects", apiHostedMini.status === 308 && apiHostedMini.location?.startsWith(ENDPOINTS.miniApp), `${apiHostedMini.status} ${apiHostedMini.location ?? ""}`);
expect("admin bundle contains Access route", adminAsset.checks["/accesses"]);
expect("admin bundle allows branch_head Access", adminAsset.checks.branch_head);
expect("admin bundle contains clients/new redirect", adminAsset.checks["/clients/new"]);
expect("mini-app bundle contains demo login", miniAsset.checks.demo);
expect("mini-app bundle removed /auth/guest", !miniAsset.checks["auth/guest"]);
expect("demo login works", demoLogin.status === 200, `${demoLogin.status}`);
expect("demo is branch_head", demoLogin.json?.user?.role === "branch_head", demoLogin.json?.user?.role ?? "missing");
expect("demo has branch scope", Number.isInteger(demoLogin.json?.user?.branchId), String(demoLogin.json?.user?.branchId ?? "missing"));
expect("demo can read Access users", demoUsers?.status === 200 && collectionLength(demoUsers.json) !== null, `${demoUsers?.status ?? "skipped"}`);
expect("demo can read mini-app clients", demoClients?.status === 200 && (collectionLength(demoClients.json) ?? 0) >= 2, `${demoClients?.status ?? "skipped"}`);

if (failures.length) {
  console.error("\nProduction audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("\nProduction audit passed.");
