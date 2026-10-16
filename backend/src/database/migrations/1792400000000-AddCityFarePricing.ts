import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCityFarePricing1792400000000 implements MigrationInterface {
  name = 'AddCityFarePricing1792400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "pricing_cities" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "city_code" varchar(12) NOT NULL,
        "city_name" varchar(100) NOT NULL,
        "country_code" varchar(2) NOT NULL,
        "currency" varchar(3) NOT NULL,
        "base_fare" numeric(12,2) NOT NULL,
        "per_kilometer" numeric(12,2) NOT NULL,
        "per_minute" numeric(12,2) NOT NULL,
        "minimum_fare" numeric(12,2) NOT NULL,
        "ride_multipliers" jsonb NOT NULL DEFAULT '{"economy":1,"scooter":0.8,"comfort":1.35,"family":1.5}'::jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "updated_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pricing_cities" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_pricing_cities_city_code" UNIQUE ("city_code"),
        CONSTRAINT "FK_pricing_cities_updated_by" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_pricing_cities_nonnegative" CHECK ("base_fare" >= 0 AND "per_kilometer" >= 0 AND "per_minute" >= 0 AND "minimum_fare" >= 0),
        CONSTRAINT "CHK_pricing_cities_currency" CHECK ("currency" ~ '^[A-Z]{3}$')
      )
    `);
    await queryRunner.query('ALTER TABLE "trips" ADD COLUMN "city_code" varchar(12)');
    await queryRunner.query('ALTER TABLE "trips" ADD COLUMN "fare_currency" varchar(3)');
    await queryRunner.query('ALTER TABLE "trips" ADD COLUMN "fare_amount" numeric(12,2)');
    await queryRunner.query('ALTER TABLE "trips" ADD COLUMN "fare_distance_meters" integer');
    await queryRunner.query('ALTER TABLE "trips" ADD COLUMN "fare_duration_seconds" integer');
    await queryRunner.query('ALTER TABLE "trips" ADD CONSTRAINT "FK_trips_pricing_city" FOREIGN KEY ("city_code") REFERENCES "pricing_cities"("city_code") ON DELETE RESTRICT');
    await queryRunner.query('ALTER TABLE "trips" ADD CONSTRAINT "CHK_trips_fare_snapshot" CHECK (("fare_amount" IS NULL AND "fare_currency" IS NULL AND "city_code" IS NULL AND "fare_distance_meters" IS NULL AND "fare_duration_seconds" IS NULL) OR ("fare_amount" IS NOT NULL AND "fare_amount" >= 0 AND "fare_currency" IS NOT NULL AND "fare_currency" ~ \'^[A-Z]{3}$\' AND "city_code" IS NOT NULL AND "fare_distance_meters" IS NOT NULL AND "fare_distance_meters" > 0 AND "fare_duration_seconds" IS NOT NULL AND "fare_duration_seconds" > 0))');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "trips" DROP CONSTRAINT "CHK_trips_fare_snapshot"');
    await queryRunner.query('ALTER TABLE "trips" DROP CONSTRAINT "FK_trips_pricing_city"');
    await queryRunner.query('ALTER TABLE "trips" DROP COLUMN "fare_duration_seconds"');
    await queryRunner.query('ALTER TABLE "trips" DROP COLUMN "fare_distance_meters"');
    await queryRunner.query('ALTER TABLE "trips" DROP COLUMN "fare_amount"');
    await queryRunner.query('ALTER TABLE "trips" DROP COLUMN "fare_currency"');
    await queryRunner.query('ALTER TABLE "trips" DROP COLUMN "city_code"');
    await queryRunner.query('DROP TABLE "pricing_cities"');
  }
}
