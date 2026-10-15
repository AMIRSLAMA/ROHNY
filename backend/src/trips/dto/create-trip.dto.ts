import {
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  TripPaymentMethod,
  TripRideType,
} from '../entities/trip.entity';

export class CreateTripDto {
  @IsString()
  @MaxLength(500)
  pickupAddress!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsLatitude()
  pickupLatitude!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsLongitude()
  pickupLongitude!: number;

  @IsString()
  @MaxLength(500)
  destinationAddress!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsLatitude()
  destinationLatitude!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsLongitude()
  destinationLongitude!: number;

  @IsEnum(TripRideType)
  rideType!: TripRideType;

  @IsInt()
  @Min(1)
  @Max(4)
  passengerCount!: number;

  @IsEnum(TripPaymentMethod)
  paymentMethod!: TripPaymentMethod;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  riderNote?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000000)
  estimatedDistanceMeters?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(172800)
  estimatedDurationSeconds?: number | null;
}
