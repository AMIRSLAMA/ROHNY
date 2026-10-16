const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  await client.connect();
  try {
    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
      [['wallet_accounts', 'wallet_transactions']],
    );
    const names = new Set(tables.rows.map((row) => row.table_name));
    if (!names.has('wallet_accounts') || !names.has('wallet_transactions')) {
      throw new Error('Wallet migration did not create both wallet tables');
    }

    const platform = await client.query(
      'SELECT count(*)::int AS count, min("currency") AS currency, min("balance_minor")::text AS balance FROM "wallet_accounts" WHERE "account_type" = $1',
      ['platform'],
    );
    if (
      platform.rows[0].count !== 1 ||
      platform.rows[0].currency !== 'EGP' ||
      platform.rows[0].balance !== '0'
    ) {
      throw new Error('Expected exactly one empty EGP platform ledger account');
    }

    console.log('Wallet schema verification passed.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
