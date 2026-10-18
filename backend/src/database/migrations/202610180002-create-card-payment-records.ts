import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive schema for card-payment preparation.
 * This migration does not contact a payment gateway or move any money.
 * Never store PAN, CVV, PIN, or raw gateway secrets in these tables.
 */
export class CreateCardPaymentRecords202610180002 implements MigrationInterface {
  name = 'CreateCardPaymentRecords202610180002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS card_payment_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE RESTRICT,
        rider_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        provider varchar(40) NOT NULL DEFAULT 'unconfigured',
        provider_payment_id varchar(180),
        idempotency_key varchar(180) NOT NULL UNIQUE,
        amount_minor bigint NOT NULL CHECK (amount_minor > 0),
        currency varchar(3) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'pending'
          CHECK (status IN (
            'pending',
            'requires_action',
            'succeeded',
            'failed',
            'canceled',
            'partially_refunded',
            'refunded'
          )),
        checkout_url text,
        failure_code varchar(100),
        failure_message varchar(500),
        safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        succeeded_at timestamptz,
        canceled_at timestamptz,
        refunded_at timestamptz,
        CONSTRAINT UQ_card_payment_provider_payment
          UNIQUE (provider, provider_payment_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_card_payment_trip_created
      ON card_payment_transactions (trip_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_card_payment_rider_created
      ON card_payment_transactions (rider_user_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_card_payment_status_created
      ON card_payment_transactions (status, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS card_payment_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_id uuid NOT NULL REFERENCES card_payment_transactions(id) ON DELETE RESTRICT,
        event_key varchar(180) NOT NULL UNIQUE,
        event_type varchar(80) NOT NULL,
        previous_status varchar(32),
        new_status varchar(32) NOT NULL,
        source varchar(40) NOT NULL DEFAULT 'system',
        safe_details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_card_payment_events_payment_created
      ON card_payment_events (payment_id, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS card_payment_events');
    await queryRunner.query('DROP TABLE IF EXISTS card_payment_transactions');
  }
}
