import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnableMultiCurrencyWallets1792200000000 implements MigrationInterface {
  name = 'EnableMultiCurrencyWallets1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Existing EGP balances and transactions are preserved.
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_wallet_accounts_owner_user_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_wallet_accounts_platform"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_wallet_accounts_owner_currency"');

    await queryRunner.query('ALTER TABLE "wallet_accounts" DROP CONSTRAINT IF EXISTS "CHK_wallet_accounts_currency"');
    await queryRunner.query('ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "CHK_wallet_transactions_currency"');

    await queryRunner.query(`
      ALTER TABLE "wallet_accounts"
      ADD CONSTRAINT "CHK_wallet_accounts_currency_format"
      CHECK ("currency" ~ '^[A-Z]{3}$')
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_transactions"
      ADD CONSTRAINT "CHK_wallet_transactions_currency_format"
      CHECK ("currency" ~ '^[A-Z]{3}$')
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_wallet_accounts_owner_currency"
      ON "wallet_accounts" ("owner_user_id", "currency")
      WHERE "owner_user_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_wallet_accounts_platform_currency"
      ON "wallet_accounts" ("account_type", "currency")
      WHERE "account_type" = 'platform'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const nonEgp = await queryRunner.query(`
      SELECT 1 FROM "wallet_accounts" WHERE "currency" <> 'EGP'
      UNION ALL
      SELECT 1 FROM "wallet_transactions" WHERE "currency" <> 'EGP'
      LIMIT 1
    `);
    if (nonEgp.length > 0) {
      throw new Error('Cannot roll back while non-EGP wallet records exist');
    }

    await queryRunner.query('DROP INDEX IF EXISTS "UQ_wallet_accounts_owner_currency"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_wallet_accounts_platform_currency"');
    await queryRunner.query('ALTER TABLE "wallet_accounts" DROP CONSTRAINT IF EXISTS "CHK_wallet_accounts_currency_format"');
    await queryRunner.query('ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "CHK_wallet_transactions_currency_format"');
    await queryRunner.query(`ALTER TABLE "wallet_accounts" ADD CONSTRAINT "CHK_wallet_accounts_currency" CHECK ("currency" = 'EGP')`);
    await queryRunner.query(`ALTER TABLE "wallet_transactions" ADD CONSTRAINT "CHK_wallet_transactions_currency" CHECK ("currency" = 'EGP')`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_wallet_accounts_owner_user_id"
      ON "wallet_accounts" ("owner_user_id") WHERE "owner_user_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_wallet_accounts_platform"
      ON "wallet_accounts" ("account_type") WHERE "account_type" = 'platform'
    `);
  }
}
