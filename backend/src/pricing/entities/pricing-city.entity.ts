import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'pricing_cities' })
@Index('UQ_pricing_cities_city_code', ['cityCode'], { unique: true })
export class PricingCity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'city_code', type: 'varchar', length: 12 })
  cityCode!: string;

  @Column({ name: 'city_name', type: 'varchar', length: 100 })
  cityName!: string;

  @Column({ name: 'country_code', type: 'varchar', length: 2 })
  countryCode!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ name: 'base_fare', type: 'numeric', precision: 12, scale: 2 })
  baseFare!: string;

  @Column({ name: 'per_kilometer', type: 'numeric', precision: 12, scale: 2 })
  perKilometer!: string;

  @Column({ name: 'per_minute', type: 'numeric', precision: 12, scale: 2 })
  perMinute!: string;

  @Column({ name: 'minimum_fare', type: 'numeric', precision: 12, scale: 2 })
  minimumFare!: string;

  @Column({ name: 'ride_multipliers', type: 'jsonb', default: () => "'{\"economy\":1,\"scooter\":0.8,\"comfort\":1.35,\"family\":1.5}'::jsonb" })
  rideMultipliers!: Record<string, number>;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
