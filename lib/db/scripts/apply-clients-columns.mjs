import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const sql = `
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_type text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_segment text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS latitude numeric(10,7);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS longitude numeric(10,7);
`;

const client = new pg.Client({ connectionString: url });
await client.connect();
console.log("connected, applying ALTERs...");
await client.query(sql);
const { rows } = await client.query(
  `SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name='clients'
     AND column_name IN ('client_type','client_segment','gender','rejection_reason','latitude','longitude')
   ORDER BY column_name;`
);
console.log("verified columns:");
console.table(rows);
await client.end();
