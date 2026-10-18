import { MigrationInterface, QueryRunner } from 'typeorm';
/** Keep only the most recent GPS point for each active trip; do not retain location history. */
export class CreateTripDriverLocations2026101800030 implements MigrationInterface {
  name='CreateTripDriverLocations2026101800030';
  public async up(queryRunner:QueryRunner):Promise<void>{
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS trip_driver_locations(
      trip_id uuid PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
      driver_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
      longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
      accuracy_meters double precision CHECK(accuracy_meters IS NULL OR accuracy_meters>=0),
      heading_degrees double precision CHECK(heading_degrees IS NULL OR heading_degrees BETWEEN 0 AND 360),
      speed_meters_per_second double precision CHECK(speed_meters_per_second IS NULL OR speed_meters_per_second>=0),
      recorded_at timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS IDX_trip_driver_locations_driver_recorded ON trip_driver_locations(driver_id,recorded_at DESC)');
  }
  public async down(queryRunner:QueryRunner):Promise<void>{await queryRunner.query('DROP TABLE IF EXISTS trip_driver_locations');}
}