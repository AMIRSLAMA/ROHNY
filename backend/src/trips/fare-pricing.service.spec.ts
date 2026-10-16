import { FarePricingService } from './fare-pricing.service';
import { TripRideType } from './entities/trip.entity';

describe('FarePricingService', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    for (const key of [
      'ROHNY_FARE_CURRENCY',
      'ROHNY_FARE_BASE',
      'ROHNY_FARE_PER_KM',
      'ROHNY_FARE_PER_MINUTE',
      'ROHNY_FARE_MINIMUM',
      'ROHNY_ROUTE_FACTOR',
      'ROHNY_AVERAGE_SPEED_KPH',
    ]) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  });

  it('calculates a server-side estimate from coordinates, not client distance fields', () => {
    const service = new FarePricingService();
    const quote = service.quote({
      pickupLatitude: 30.0444,
      pickupLongitude: 31.2357,
      destinationLatitude: 30.0626,
      destinationLongitude: 31.2497,
      rideType: TripRideType.ECONOMY,
    });

    expect(quote.currency).toBe('EGP');
    expect(quote.estimatedDistanceMeters).toBeGreaterThan(0);
    expect(quote.estimatedDurationSeconds).toBeGreaterThan(0);
    expect(quote.estimatedFare).toBeGreaterThan(0);
    expect(quote.estimateOnly).toBe(true);
  });

  it('uses a ride-type multiplier', () => {
    const service = new FarePricingService();
    const coordinates = {
      pickupLatitude: 30.0444,
      pickupLongitude: 31.2357,
      destinationLatitude: 30.0626,
      destinationLongitude: 31.2497,
    };

    const economy = service.quote({ ...coordinates, rideType: TripRideType.ECONOMY });
    const comfort = service.quote({ ...coordinates, rideType: TripRideType.COMFORT });

    expect(comfort.estimatedFare).toBeGreaterThan(economy.estimatedFare);
  });

  it('returns no fare for near-identical pickup and destination coordinates', () => {
    const service = new FarePricingService();
    const quote = service.quote({
      pickupLatitude: 30.0444,
      pickupLongitude: 31.2357,
      destinationLatitude: 30.0444,
      destinationLongitude: 31.2357,
      rideType: TripRideType.ECONOMY,
    });

    expect(quote.estimatedFare).toBe(0);
    expect(quote.estimatedDistanceMeters).toBe(0);
  });
});
