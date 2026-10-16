import { IsIn } from 'class-validator';
import { TripStatus } from '../entities/trip.entity';

export class UpdateDriverTripStatusDto {
  @IsIn([
    TripStatus.DRIVER_ARRIVING,
    TripStatus.IN_PROGRESS,
    TripStatus.COMPLETED,
  ])
  status!: TripStatus;
}
