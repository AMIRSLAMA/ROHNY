import { IsEnum } from 'class-validator';
import { TripStatus } from '../entities/trip.entity';

export enum DriverTripStatus {
  DRIVER_ARRIVING = TripStatus.DRIVER_ARRIVING,
  IN_PROGRESS = TripStatus.IN_PROGRESS,
  COMPLETED = TripStatus.COMPLETED,
}

export class UpdateDriverTripStatusDto {
  @IsEnum(DriverTripStatus)
  status!: DriverTripStatus;
}
