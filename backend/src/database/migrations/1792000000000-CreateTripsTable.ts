import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTripsTable1792000000000 implements MigrationInterface {
  name = 'CreateTripsTable1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "trips" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "rider_id" uuid NOT NULL,
        "pickup_address" character varying(500) NOT NULL,
        "pickup_latitude" double precision NOT NULL,
        "pickup_longitude" double precision NOT NULL,
        "destination_address" character varying(500) NOT NULL,
        "destination_latitude" double precision NOT NULL,
        "destination_longitude" double precision NOT NULL,
        "ride_type" character varying(20) NOT NULL,
        "passenger_count" smallint NOT NULL DEFAULT 1,
        "payment_method" character varying(20) NOT NULL,
        "scheduled_at" TIMESTAMP WITH TIME ZONE,
        "rider_note" character varying(240),
        "estimated_distance_meters" integer,
        "estimated_duration_seconds" integer,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_trips_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_trips_rider_id_users_id" FOREIGN KEY ("rider_id")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "CHK_trips_passenger_count" CHECK ("passenger_count" BETWEEN 1 AND 4),
        CONSTRAINT "CHK_trips_ride_type" CHECK ("ride_type" IN ('economy','comfort','family')),
        CONSTRAINT "CHK_trips_payment_method" CHECK ("payment_method" IN ('cash','wallet','card')),
        CONSTRAINT "CHK_trips_status" CHECK ("status" IN ('pending','cancelled'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_trips_rider_created_at"
      ON "trips" ("rider_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_trips_rider_created_at"');
    await queryRunner.query('DROP TABLE "trips"');
  }
}
