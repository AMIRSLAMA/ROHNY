import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthTokenGuard, AuthenticatedRequest } from '../auth/auth-token.guard';
import { UserRole } from '../users/entities/user.entity';
import { UpsertPricingCityDto } from './dto/upsert-pricing-city.dto';
import { PricingService } from './pricing.service';
import { IsEnum, IsNumber, IsString, Matches, Max, Min } from 'class-validator';
import { TripRideType } from '../trips/entities/trip.entity';

class FareQuoteDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,12}$/)
  cityCode!: string;

  @IsEnum(TripRideType)
  rideType!: TripRideType;

  @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-90) @Max(90)
  pickupLatitude!: number;
  @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-180) @Max(180)
  pickupLongitude!: number;
  @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-90) @Max(90)
  destinationLatitude!: number;
  @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-180) @Max(180)
  destinationLongitude!: number;
}

@Controller('pricing')
export class PublicPricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get('cities')
  listCities() {
    return this.pricing.listActiveCities().then(cities => cities.map(({ cityCode, cityName, countryCode, currency }) => ({ cityCode, cityName, countryCode, currency })));
  }

  @Post('quote')
  @UseGuards(AuthTokenGuard)
  quote(@Req() request: AuthenticatedRequest, @Body() input: FareQuoteDto) {
    if (request.authUser?.role !== UserRole.RIDER) throw new ForbiddenException('Only rider accounts can request fare quotes');
    return this.pricing.quote(input);
  }
}

@Controller('admin/pricing')
@UseGuards(AuthTokenGuard)
export class AdminPricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get('cities')
  list(@Req() request: AuthenticatedRequest) {
    if (request.authUser?.role !== UserRole.ADMIN) throw new ForbiddenException('Admin access required');
    return this.pricing.listAllCities();
  }

  @Post('cities')
  upsert(@Req() request: AuthenticatedRequest, @Body() input: UpsertPricingCityDto) {
    if (request.authUser?.role !== UserRole.ADMIN) throw new ForbiddenException('Admin access required');
    return this.pricing.upsertCity(input, request.authUser.sub);
  }
}
