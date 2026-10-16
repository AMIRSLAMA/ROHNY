import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingCity } from './entities/pricing-city.entity';
import { UpsertPricingCityDto } from './dto/upsert-pricing-city.dto';
import { TripRideType } from '../trips/entities/trip.entity';

export interface RouteEstimate {
  distanceMeters: number;
  durationSeconds: number;
}

@Injectable()
export class PricingService {
  constructor(@InjectRepository(PricingCity) private readonly cities: Repository<PricingCity>) {}

  listActiveCities() {
    return this.cities.find({ where: { isActive: true }, order: { countryCode: 'ASC', cityName: 'ASC' } });
  }

  listAllCities() {
    return this.cities.find({ order: { countryCode: 'ASC', cityName: 'ASC' } });
  }

  async upsertCity(input: UpsertPricingCityDto, adminId: string) {
    const multipliers = input.rideMultipliers ?? { economy: 1, scooter: 0.8, comfort: 1.35, family: 1.5 };
    for (const type of Object.values(TripRideType)) {
      const multiplier = multipliers[type];
      if (multiplier !== undefined && (typeof multiplier !== 'number' || !Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 10)) {
        throw new BadRequestException('Ride multipliers must be greater than 0 and at most 10');
      }
    }
    const cityCode = input.cityCode.trim().toUpperCase();
    const existing = await this.cities.findOne({ where: { cityCode } });
    const city = this.cities.create({
      ...(existing ?? {}),
      cityCode,
      cityName: input.cityName.trim(),
      countryCode: input.countryCode.toUpperCase(),
      currency: input.currency.toUpperCase(),
      baseFare: input.baseFare.toFixed(2),
      perKilometer: input.perKilometer.toFixed(2),
      perMinute: input.perMinute.toFixed(2),
      minimumFare: input.minimumFare.toFixed(2),
      rideMultipliers: multipliers,
      isActive: input.isActive ?? true,
      updatedBy: adminId,
    });
    return this.cities.save(city);
  }

  async quote(input: {
    cityCode: string;
    rideType: TripRideType;
    pickupLatitude: number;
    pickupLongitude: number;
    destinationLatitude: number;
    destinationLongitude: number;
  }) {
    const cityCode = input.cityCode.trim().toUpperCase();
    const city = await this.cities.findOne({ where: { cityCode, isActive: true } });
    if (!city) throw new NotFoundException('No active fare configuration exists for this city');

    const route = await this.getRoute(input);
    const multiplier = Number(city.rideMultipliers?.[input.rideType] ?? 1);
    const rawFare = Number(city.baseFare)
      + (route.distanceMeters / 1000) * Number(city.perKilometer)
      + (route.durationSeconds / 60) * Number(city.perMinute);
    const fareAmount = Math.round(Math.max(Number(city.minimumFare), rawFare * multiplier) * 100) / 100;

    return {
      cityCode: city.cityCode,
      cityName: city.cityName,
      countryCode: city.countryCode,
      currency: city.currency,
      rideType: input.rideType,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      fareAmount,
      fareRule: {
        baseFare: Number(city.baseFare),
        perKilometer: Number(city.perKilometer),
        perMinute: Number(city.perMinute),
        minimumFare: Number(city.minimumFare),
        rideMultiplier: multiplier,
      },
    };
  }

  private async getRoute(input: {
    pickupLatitude: number;
    pickupLongitude: number;
    destinationLatitude: number;
    destinationLongitude: number;
  }): Promise<RouteEstimate> {
    const baseUrl = (process.env.ROHNY_ROUTING_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
    const coordinates = [
      input.pickupLongitude, input.pickupLatitude,
      input.destinationLongitude, input.destinationLatitude,
    ];
    const url = baseUrl + '/route/v1/driving/' + coordinates[0] + ',' + coordinates[1] + ';' + coordinates[2] + ',' + coordinates[3] + '?overview=false&alternatives=false&steps=false';
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
    } catch {
      throw new BadGatewayException('Route service is unavailable; please retry the fare estimate');
    }
    if (!response.ok) throw new BadGatewayException('Route service could not calculate this route');
    const data = await response.json() as { code?: string; routes?: Array<{ distance?: number; duration?: number }> };
    const route = data.routes?.[0];
    if (data.code !== 'Ok' || !route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration) || route.distance! <= 0 || route.duration! <= 0) {
      throw new BadRequestException('No drivable route was found between these locations');
    }
    return { distanceMeters: Math.round(route.distance!), durationSeconds: Math.round(route.duration!) };
  }
}
