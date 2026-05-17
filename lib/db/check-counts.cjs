const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const tables = [
    "credit_products",
    "sap_codes",
    "credit_lines",
    "products",
    "product_categories",
    "clients",
    "users",
    "branches",
    "collateral_types",
    "system_settings",
  ];
  for (const t of tables) {
    try {
      const r = await c.query("SELECT COUNT(*)::int AS n FROM " + t);
      console.log(t.padEnd(22) + " = " + r.rows[0].n);
    } catch (e) {
      console.log(t.padEnd(22) + " ERR " + e.message);
    }
  }
  await c.end();
})();
