import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, Length, Matches, Max, Min, MaxLength } from 'class-validator';

export class UpsertPricingCityDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,12}$/)
  cityCode!: string;

  @IsString()
  @MaxLength(100)
  cityName!: string;

  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1000000)
  baseFare!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1000000)
  perKilometer!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1000000)
  perMinute!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1000000)
  minimumFare!: number;

  @IsOptional()
  @IsObject()
  rideMultipliers?: Record<string, number>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
