import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWalletDepositRequests202610170001 implements MigrationInterface {
  name = 'CreateWalletDepositRequests202610170001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wallet_deposit_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        rider_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        amount_minor bigint NOT NULL CHECK (amount_minor > 0),
        currency varchar(3) NOT NULL,
        rider_note varchar(240),
        status varchar(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected')),
        admin_note varchar(240),
        reviewed_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT now(),
        reviewed_at timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_wallet_deposit_requests_rider_created
      ON wallet_deposit_requests (rider_user_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_wallet_deposit_requests_status_created
      ON wallet_deposit_requests (status, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS wallet_deposit_requests');
  }
}
