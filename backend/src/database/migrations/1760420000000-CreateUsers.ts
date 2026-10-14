import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1760420000000 implements MigrationInterface {
  name = 'CreateUsers1760420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "users_role_enum" AS ENUM ('rider', 'driver', 'admin')`);
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(254),
        "phone" character varying(20),
        "password_hash" character varying(255),
        "role" "users_role_enum" NOT NULL DEFAULT 'rider',
        "is_active" boolean NOT NULL DEFAULT true,
        "phone_verified_at" TIMESTAMPTZ,
        "email_verified_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_users_contact" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL)
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_phone" ON "users" ("phone")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_phone"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
  }
}
