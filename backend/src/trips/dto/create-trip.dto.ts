import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
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
  @Matches(/^[A-Z0-9_-]{2,12}$/)
  cityCode!: string;

  @IsString()
  @MaxLength(500)
  pickupAddress!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  pickupLatitude!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  pickupLongitude!: number;

  @IsString()
  @MaxLength(500)
  destinationAddress!: string;

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
