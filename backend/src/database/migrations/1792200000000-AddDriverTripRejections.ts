import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDriverTripRejections1792200000000 implements MigrationInterface {
  name = 'AddDriverTripRejections1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trips" ADD COLUMN "rejected_driver_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[]`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trips" DROP COLUMN "rejected_driver_ids"`);
  }
}
