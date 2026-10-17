import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendWalletDepositsToDrivers1792500000000 implements MigrationInterface {
  name = 'ExtendWalletDepositsToDrivers1792500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wallet_deposit_requests
      ADD COLUMN owner_role varchar(10) NOT NULL DEFAULT 'rider'
      CHECK (owner_role IN ('rider', 'driver'))
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_wallet_deposit_requests_role_status_created
      ON wallet_deposit_requests (owner_role, status, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS IDX_wallet_deposit_requests_role_status_created');
    await queryRunner.query('ALTER TABLE wallet_deposit_requests DROP COLUMN owner_role');
  }
}
