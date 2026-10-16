import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TripRideType {
  ECONOMY = 'economy',
  SCOOTER = 'scooter',
  COMFORT = 'comfort',
  FAMILY = 'family',
}

export enum TripPaymentMethod {
  CASH = 'cash',
  WALLET = 'wallet',
  CARD = 'card',
}

export enum TripStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DRIVER_ARRIVING = 'driver_arriving',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity({ name: 'trips' })
@Index('IDX_trips_rider_created_at', ['riderId', 'createdAt'])
@Index('IDX_trips_driver_status_created', ['driverId', 'status', 'createdAt'])
export class Trip {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'rider_id', type: 'uuid' })
  riderId!: string;

  @Column({ name: 'driver_id', type: 'uuid', nullable: true })
  driverId!: string | null;

  @Column({ name: 'rejected_driver_ids', type: 'uuid', array: true, default: () => "'{}'::uuid[]" })
  rejectedDriverIds!: string[];

  @Column({ name: 'pickup_address', type: 'varchar', length: 500 })
  pickupAddress!: string;

  @Column({ name: 'pickup_latitude', type: 'double precision' })
  pickupLatitude!: number;

  @Column({ name: 'pickup_longitude', type: 'double precision' })
  pickupLongitude!: number;

  @Column({ name: 'destination_address', type: 'varchar', length: 500 })
  destinationAddress!: string;

  @Column({ name: 'destination_latitude', type: 'double precision' })
  destinationLatitude!: number;

  @Column({ name: 'destination_longitude', type: 'double precision' })
  destinationLongitude!: number;

  @Column({ name: 'ride_type', type: 'varchar', length: 20 })
  rideType!: TripRideType;

  @Column({ name: 'passenger_count', type: 'smallint', default: 1 })
  passengerCount!: number;

  @Column({ name: 'payment_method', type: 'varchar', length: 20 })
  paymentMethod!: TripPaymentMethod;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt!: Date | null;

  @Column({ name: 'rider_note', type: 'varchar', length: 240, nullable: true })
  riderNote!: string | null;

  @Column({ name: 'estimated_distance_meters', type: 'integer', nullable: true })
  estimatedDistanceMeters!: number | null;

  @Column({ name: 'estimated_duration_seconds', type: 'integer', nullable: true })
  estimatedDurationSeconds!: number | null;

  @Column({ name: 'city_code', type: 'varchar', length: 12, nullable: true })
  cityCode!: string | null;

  @Column({ name: 'fare_currency', type: 'varchar', length: 3, nullable: true })
  fareCurrency!: string | null;

  @Column({ name: 'fare_amount', type: 'numeric', precision: 12, scale: 2, nullable: true })
  fareAmount!: string | null;

  @Column({ name: 'fare_distance_meters', type: 'integer', nullable: true })
  fareDistanceMeters!: number | null;

  @Column({ name: 'fare_duration_seconds', type: 'integer', nullable: true })
  fareDurationSeconds!: number | null;

  @Column({ type: 'varchar', length: 20, default: TripStatus.PENDING })
  status!: TripStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
