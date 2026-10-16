import {
  IsEnum,
  IsNumber,
  Max,
  Min,
} from 'class-validator';
import { TripRideType } from '../entities/trip.entity';

export class FareQuoteDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  pickupLatitude!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  pickupLongitude!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  destinationLatitude!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  destinationLongitude!: number;

  @IsEnum(TripRideType)
  rideType!: TripRideType;
}
