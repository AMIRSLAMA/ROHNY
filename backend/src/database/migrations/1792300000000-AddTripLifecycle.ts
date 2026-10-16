import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTripLifecycle1792300000000 implements MigrationInterface {
  name = 'AddTripLifecycle1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "trips" ADD COLUMN "driver_id" uuid');
    await queryRunner.query(`
      ALTER TABLE "trips"
      ADD CONSTRAINT "FK_trips_driver_id_users_id"
      FOREIGN KEY ("driver_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query('ALTER TABLE "trips" DROP CONSTRAINT "CHK_trips_status"');
    await queryRunner.query(`
      ALTER TABLE "trips"
      ADD CONSTRAINT "CHK_trips_status"
      CHECK ("status" IN ('pending','accepted','driver_arriving','in_progress','completed','cancelled'))
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_trips_driver_status_created"
      ON "trips" ("driver_id", "status", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const advancedTrips = await queryRunner.query(`
      SELECT 1 FROM "trips"
      WHERE "status" NOT IN ('pending','cancelled')
      LIMIT 1
    `);
    if (advancedTrips.length > 0) {
      throw new Error('Cannot roll back trip lifecycle while trips use active/completed statuses');
    }

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_trips_driver_status_created"');
    await queryRunner.query('ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "FK_trips_driver_id_users_id"');
    await queryRunner.query('ALTER TABLE "trips" DROP COLUMN IF EXISTS "driver_id"');
    await queryRunner.query('ALTER TABLE "trips" DROP CONSTRAINT "CHK_trips_status"');
    await queryRunner.query(`
      ALTER TABLE "trips"
      ADD CONSTRAINT "CHK_trips_status"
      CHECK ("status" IN ('pending','cancelled'))
    `);
  }
}
