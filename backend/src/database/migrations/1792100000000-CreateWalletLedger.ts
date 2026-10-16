import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWalletLedger1792100000000 implements MigrationInterface {
  name = 'CreateWalletLedger1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "wallet_accounts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_user_id" uuid,
        "account_type" character varying(10) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'EGP',
        "balance_minor" bigint NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet_accounts_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wallet_accounts_owner_user" FOREIGN KEY ("owner_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "CHK_wallet_accounts_type_owner" CHECK (
          ("account_type" = 'user' AND "owner_user_id" IS NOT NULL)
          OR ("account_type" = 'platform' AND "owner_user_id" IS NULL)
        ),
        CONSTRAINT "CHK_wallet_accounts_currency" CHECK ("currency" = 'EGP'),
        CONSTRAINT "CHK_wallet_accounts_balance_nonnegative" CHECK ("balance_minor" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_wallet_accounts_owner_user_id"
      ON "wallet_accounts" ("owner_user_id") WHERE "owner_user_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_wallet_accounts_platform"
      ON "wallet_accounts" ("account_type") WHERE "account_type" = 'platform'
    `);
    await queryRunner.query(`
      CREATE TABLE "wallet_transactions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "from_account_id" uuid,
        "to_account_id" uuid,
        "created_by_user_id" uuid,
        "type" character varying(30) NOT NULL,
        "amount_minor" bigint NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'EGP',
        "idempotency_key" character varying(100) NOT NULL,
        "related_trip_id" uuid,
        "description" character varying(240),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallet_transactions_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "FK_wallet_transactions_from" FOREIGN KEY ("from_account_id")
          REFERENCES "wallet_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_wallet_transactions_to" FOREIGN KEY ("to_account_id")
          REFERENCES "wallet_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_wallet_transactions_actor" FOREIGN KEY ("created_by_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "CHK_wallet_transactions_amount" CHECK ("amount_minor" > 0),
        CONSTRAINT "CHK_wallet_transactions_currency" CHECK ("currency" = 'EGP'),
        CONSTRAINT "CHK_wallet_transactions_distinct_accounts" CHECK (
          "from_account_id" IS NULL OR "to_account_id" IS NULL
          OR "from_account_id" <> "to_account_id"
        ),
        CONSTRAINT "CHK_wallet_transactions_transfer_accounts" CHECK (
          "type" <> 'transfer' OR
          ("from_account_id" IS NOT NULL AND "to_account_id" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_wallet_transactions_from_created"
      ON "wallet_transactions" ("from_account_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_wallet_transactions_to_created"
      ON "wallet_transactions" ("to_account_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      INSERT INTO "wallet_accounts" ("account_type", "currency", "balance_minor")
      VALUES ('platform', 'EGP', 0)
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "wallet_transactions"');
    await queryRunner.query('DROP TABLE "wallet_accounts"');
  }
}
