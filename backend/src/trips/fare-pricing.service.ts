import { Injectable } from '@nestjs/common';
import { TripRideType } from './entities/trip.entity';

export interface FareQuoteInput {
  pickupLatitude: number;
  pickupLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  rideType: TripRideType;
}

const DEFAULT_RATES: Record<TripRideType, number> = {
  [TripRideType.ECONOMY]: 1,
  [TripRideType.SCOOTER]: 0.7,
  [TripRideType.COMFORT]: 1.35,
  [TripRideType.FAMILY]: 1.5,
};

@Injectable()
export class FarePricingService {
  // Defaults are development examples only; set these per operating market before launch.
  private readonly currency = process.env.ROHNY_FARE_CURRENCY ?? 'EGP';
  private readonly baseFare = this.readPositiveNumber('ROHNY_FARE_BASE', 10);
  private readonly perKilometer = this.readPositiveNumber('ROHNY_FARE_PER_KM', 5);
  private readonly perMinute = this.readPositiveNumber('ROHNY_FARE_PER_MINUTE', 0.5);
  private readonly minimumFare = this.readPositiveNumber('ROHNY_FARE_MINIMUM', 15);
  private readonly routeFactor = this.readPositiveNumber('ROHNY_ROUTE_FACTOR', 1.3);
  private readonly averageSpeedKph = this.readPositiveNumber('ROHNY_AVERAGE_SPEED_KPH', 25);

  quote(input: FareQuoteInput) {
    const straightLineMeters = this.distanceMeters(
      input.pickupLatitude,
      input.pickupLongitude,
      input.destinationLatitude,
      input.destinationLongitude,
    );

    if (straightLineMeters < 50) {
      return {
        currency: this.currency,
        estimatedDistanceMeters: 0,
        estimatedDurationSeconds: 0,
        estimatedFare: 0,
        pricingVersion: 'estimate-v1',
        estimateOnly: true,
        note: 'Pickup and destination are too close to produce a fare estimate.',
      };
    }

    const estimatedDistanceMeters = Math.ceil(straightLineMeters * this.routeFactor);
    const estimatedDurationSeconds = Math.ceil(
      (estimatedDistanceMeters / 1000 / this.averageSpeedKph) * 3600,
    );
    const multiplier = DEFAULT_RATES[input.rideType];
    const rawFare =
      (this.baseFare +
        (estimatedDistanceMeters / 1000) * this.perKilometer +
        (estimatedDurationSeconds / 60) * this.perMinute) *
      multiplier;
    const estimatedFare = Math.round(Math.max(this.minimumFare, rawFare) * 100) / 100;

    return {
      currency: this.currency,
      estimatedDistanceMeters,
      estimatedDurationSeconds,
      estimatedFare,
      pricingVersion: 'estimate-v1',
      estimateOnly: true,
      note: 'Preliminary estimate using straight-line coordinates and a configurable route factor; not a final quote.',
    };
  }

  private readPositiveNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a finite number greater than zero`);
    }
    return value;
  }

  private distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const dLat = radians(lat2 - lat1);
    const dLon = radians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(radians(lat1)) *
        Math.cos(radians(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
