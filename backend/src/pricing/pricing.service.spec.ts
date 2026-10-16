import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PricingCity } from './entities/pricing-city.entity';
import { PricingService } from './pricing.service';
import { TripRideType } from '../trips/entities/trip.entity';

describe('PricingService', () => {
  let service: PricingService;
  let repository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  const city = {
    id: 'city-id',
    cityCode: 'CAI',
    cityName: 'Cairo',
    countryCode: 'EG',
    currency: 'EGP',
    baseFare: '10.00',
    perKilometer: '2.00',
    perMinute: '0.50',
    minimumFare: '15.00',
    rideMultipliers: { economy: 1, scooter: 0.8, comfort: 1.35, family: 1.5 },
    isActive: true,
    updatedBy: null,
  };

  beforeEach(() => {
    repository = {
      find: jest.fn(async () => [city]),
      findOne: jest.fn(async () => city),
      create: jest.fn(value => value),
      save: jest.fn(async value => value),
    };
    service = new PricingService(repository as unknown as Repository<PricingCity>);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calculates fare from server route distance and duration in the city currency', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', routes: [{ distance: 5000, duration: 600 }] }),
    } as Response);

    const quote = await service.quote({
      cityCode: 'cai',
      rideType: TripRideType.ECONOMY,
      pickupLatitude: 30.01,
      pickupLongitude: 31.2,
      destinationLatitude: 30.04,
      destinationLongitude: 31.23,
    });

    expect(quote).toMatchObject({
      cityCode: 'CAI',
      currency: 'EGP',
      distanceMeters: 5000,
      durationSeconds: 600,
      fareAmount: 25,
    });
    expect(repository.findOne).toHaveBeenCalledWith({ where: { cityCode: 'CAI', isActive: true } });
  });

  it('applies the configured ride multiplier after the distance/time calculation', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', routes: [{ distance: 5000, duration: 600 }] }),
    } as Response);

    const quote = await service.quote({
      cityCode: 'CAI',
      rideType: TripRideType.COMFORT,
      pickupLatitude: 30.01,
      pickupLongitude: 31.2,
      destinationLatitude: 30.04,
      destinationLongitude: 31.23,
    });

    expect(quote.fareAmount).toBe(33.75);
  });

  it('rejects quotes for cities without active pricing', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    repository.findOne.mockResolvedValueOnce(null);
    await expect(service.quote({
      cityCode: 'XYZ',
      rideType: TripRideType.ECONOMY,
      pickupLatitude: 30,
      pickupLongitude: 31,
      destinationLatitude: 30.1,
      destinationLongitude: 31.1,
    })).rejects.toThrow(NotFoundException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports route-provider outages instead of trusting client-supplied distance', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    await expect(service.quote({
      cityCode: 'CAI',
      rideType: TripRideType.ECONOMY,
      pickupLatitude: 30,
      pickupLongitude: 31,
      destinationLatitude: 30.1,
      destinationLongitude: 31.1,
    })).rejects.toThrow(BadGatewayException);
  });
});
