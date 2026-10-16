import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDriverProfiles1771200000000 implements MigrationInterface {
  name = 'CreateDriverProfiles1771200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "driver_profiles" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL,
      "full_name" varchar(160) NOT NULL DEFAULT '',
      "national_id_number" varchar(40) NOT NULL DEFAULT '',
      "national_id_expiry" date,
      "vehicle_type" varchar(40) NOT NULL DEFAULT '',
      "vehicle_make" varchar(80) NOT NULL DEFAULT '',
      "vehicle_model" varchar(80) NOT NULL DEFAULT '',
      "vehicle_year" smallint,
      "vehicle_color" varchar(40) NOT NULL DEFAULT '',
      "vehicle_plate" varchar(30) NOT NULL DEFAULT '',
      "driving_license_number" varchar(50) NOT NULL DEFAULT '',
      "driving_license_expiry" date,
      "vehicle_license_number" varchar(50) NOT NULL DEFAULT '',
      "vehicle_license_expiry" date,
      "images" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "review_status" varchar(24) NOT NULL DEFAULT 'not_submitted',
      "review_note" varchar(500) NOT NULL DEFAULT '',
      "reviewed_by" uuid,
      "reviewed_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_driver_profiles_id" PRIMARY KEY ("id"),
      CONSTRAINT "FK_driver_profiles_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_driver_profiles_reviewed_by" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_driver_profiles_user_id" ON "driver_profiles" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_driver_profiles_review_status" ON "driver_profiles" ("review_status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "driver_profiles"`);
  }
}
