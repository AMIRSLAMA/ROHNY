import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRohnyTripAccounting1792281600000 implements MigrationInterface {
  name = 'AddRohnyTripAccounting1792281600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Additive-only changes: existing trip records and wallet balances remain untouched.
    await queryRunner.query(`
      ALTER TABLE trips
        ADD COLUMN IF NOT EXISTS platform_commission_amount numeric(12,2),
        ADD COLUMN IF NOT EXISTS rider_free_ride boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS captain_reward_amount numeric(12,2),
        ADD COLUMN IF NOT EXISTS accounting_processed_at timestamptz
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rohny_accounting_settings (
        setting_key varchar(80) PRIMARY KEY,
        setting_value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      INSERT INTO rohny_accounting_settings (setting_key, setting_value)
      VALUES
        ('platform_commission_percent', '10'::jsonb),
        ('rider_free_ride_every', '5'::jsonb),
        ('captain_bonus_every', '10'::jsonb),
        ('captain_bonus_amount_egp', '50'::jsonb),
        ('currency', '"EGP"'::jsonb),
        ('payment_mode', '"cash"'::jsonb)
      ON CONFLICT (setting_key) DO NOTHING
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rohny_reward_ledger (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE RESTRICT,
        reward_type varchar(40) NOT NULL CHECK (reward_type IN ('rider_free_ride_earned', 'rider_free_ride_used', 'captain_bonus')),
        amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
        currency varchar(3) NOT NULL DEFAULT 'EGP',
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (trip_id, reward_type)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_rohny_reward_ledger_user_created
      ON rohny_reward_ledger (user_id, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS rohny_reward_ledger');
    await queryRunner.query('DROP TABLE IF EXISTS rohny_accounting_settings');
    await queryRunner.query(`
      ALTER TABLE trips
        DROP COLUMN IF EXISTS platform_commission_amount,
        DROP COLUMN IF EXISTS rider_free_ride,
        DROP COLUMN IF EXISTS captain_reward_amount,
        DROP COLUMN IF EXISTS accounting_processed_at
    `);
  }
}
