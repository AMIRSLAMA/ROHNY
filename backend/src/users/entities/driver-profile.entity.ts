import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type DocumentReviewStatus = 'not_submitted' | 'pending' | 'approved' | 'needs_changes';

@Entity({ name: 'driver_profiles' })
@Index('UQ_driver_profiles_user_id', ['userId'], { unique: true })
export class DriverProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 160, default: '' })
  fullName!: string;

  @Column({ name: 'national_id_number', type: 'varchar', length: 40, default: '' })
  nationalIdNumber!: string;

  @Column({ name: 'national_id_expiry', type: 'date', nullable: true })
  nationalIdExpiry!: string | null;

  @Column({ name: 'vehicle_type', type: 'varchar', length: 40, default: '' })
  vehicleType!: string;

  @Column({ name: 'vehicle_make', type: 'varchar', length: 80, default: '' })
  vehicleMake!: string;

  @Column({ name: 'vehicle_model', type: 'varchar', length: 80, default: '' })
  vehicleModel!: string;

  @Column({ name: 'vehicle_year', type: 'smallint', nullable: true })
  vehicleYear!: number | null;

  @Column({ name: 'vehicle_color', type: 'varchar', length: 40, default: '' })
  vehicleColor!: string;

  @Column({ name: 'vehicle_plate', type: 'varchar', length: 30, default: '' })
  vehiclePlate!: string;

  @Column({ name: 'driving_license_number', type: 'varchar', length: 50, default: '' })
  drivingLicenseNumber!: string;

  @Column({ name: 'driving_license_expiry', type: 'date', nullable: true })
  drivingLicenseExpiry!: string | null;

  @Column({ name: 'vehicle_license_number', type: 'varchar', length: 50, default: '' })
  vehicleLicenseNumber!: string;

  @Column({ name: 'vehicle_license_expiry', type: 'date', nullable: true })
  vehicleLicenseExpiry!: string | null;

  // Images are kept private in PostgreSQL and are only returned by authenticated endpoints.
  @Column({ name: 'images', type: 'jsonb', default: () => "'{}'::jsonb" })
  images!: Record<string, string>;

  @Column({ name: 'review_status', type: 'varchar', length: 24, default: 'not_submitted' })
  reviewStatus!: DocumentReviewStatus;

  @Column({ name: 'review_note', type: 'varchar', length: 500, default: '' })
  reviewNote!: string;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
