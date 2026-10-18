import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extend card payment records for rider/captain wallet top-ups and captain commission.
 * This is additive and does not enable live charges by itself.
 */
export class ExtendCardPaymentPurposes2026101800030 implements MigrationInterface {
  name = 'ExtendCardPaymentPurposes2026101800030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE card_payment_transactions
        ALTER COLUMN trip_id DROP NOT NULL,
        ALTER COLUMN rider_user_id DROP NOT NULL,
        ADD COLUMN IF NOT EXISTS payer_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
        ADD COLUMN IF NOT EXISTS purpose varchar(32) NOT NULL DEFAULT 'trip_fare'
          CHECK (purpose IN ('trip_fare', 'rider_wallet_topup', 'driver_commission', 'driver_wallet_topup'))
    `);
    await queryRunner.query(`
      UPDATE card_payment_transactions
      SET payer_user_id = rider_user_id
      WHERE payer_user_id IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE card_payment_transactions
        ALTER COLUMN payer_user_id SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE card_payment_transactions
        ADD CONSTRAINT CHK_card_payment_context
        CHECK (
          (purpose IN ('trip_fare', 'driver_commission') AND trip_id IS NOT NULL)
          OR (purpose IN ('rider_wallet_topup', 'driver_wallet_topup') AND trip_id IS NULL)
        )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_card_payment_payer_created
      ON card_payment_transactions (payer_user_id, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS IDX_card_payment_payer_created');
    await queryRunner.query('ALTER TABLE card_payment_transactions DROP CONSTRAINT IF EXISTS CHK_card_payment_context');
    await queryRunner.query('ALTER TABLE card_payment_transactions DROP COLUMN IF EXISTS purpose');
    await queryRunner.query('ALTER TABLE card_payment_transactions DROP COLUMN IF EXISTS payer_user_id');
    await queryRunner.query('ALTER TABLE card_payment_transactions ALTER COLUMN trip_id SET NOT NULL');
    await queryRunner.query('ALTER TABLE card_payment_transactions ALTER COLUMN rider_user_id SET NOT NULL');
  }
}