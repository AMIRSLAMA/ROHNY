import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTripFareSnapshot1792300000000 implements MigrationInterface {
  name = 'AddTripFareSnapshot1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trips"
      ADD COLUMN "fare_amount" double precision,
      ADD COLUMN "fare_currency" varchar(3),
      ADD COLUMN "pricing_version" varchar(40)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trips"
      DROP COLUMN "pricing_version",
      DROP COLUMN "fare_currency",
      DROP COLUMN "fare_amount"
    `);
  }
}
