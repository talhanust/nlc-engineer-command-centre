/* eslint-disable */
// Idempotent schema loader for Render (run as the pre-deploy command).
// - Loads ../db/schema.sql only if the fnpc.app_user table is absent.
// - If SEED_DEV_USER=1 (or no users exist), seeds one admin user so the
//   dev X-User auth has someone to authenticate as. Disable in real prod.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) { console.error('migrate: DATABASE_URL not set'); process.exit(1); }
  const ssl = process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false };
  const client = new Client({ connectionString, ssl });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT to_regclass('fnpc.app_user') AS t");
    if (!rows[0].t) {
      const schemaPath = path.resolve(__dirname, '..', '..', 'db', 'schema.sql');
      console.log('migrate: loading schema from', schemaPath);
      await client.query(fs.readFileSync(schemaPath, 'utf8'));
      console.log('migrate: schema loaded');
    } else {
      console.log('migrate: schema already present, skipping');
    }

    const seed = process.env.SEED_DEV_USER === '1';
    const userCount = await client.query('SELECT count(*)::int AS n FROM fnpc.app_user');
    if (seed || userCount.rows[0].n === 0) {
      const username = process.env.DEV_USER_NAME || 'demo';
      await client.query(
        `INSERT INTO fnpc.app_user (idp_subject, username, display_name, is_active)
           VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (username) DO NOTHING`,
        [`dev:${username}`, username, 'Demo Admin'],
      );
      await client.query(
        `INSERT INTO fnpc.user_role (user_id, role_key, scope_node)
         SELECT u.id, 'admin', 'hq-nlc' FROM fnpc.app_user u WHERE u.username = $1
         ON CONFLICT DO NOTHING`,
        [username],
      );
      console.log(`migrate: ensured dev admin user '${username}' (X-User: ${username})`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('migrate failed:', e); process.exit(1); });
