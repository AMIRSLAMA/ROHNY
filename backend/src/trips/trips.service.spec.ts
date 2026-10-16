import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CreateTripDto } from './dto/create-trip.dto';
import { FarePricingService } from './fare-pricing.service';
import { Trip, TripPaymentMethod, TripRideType, TripStatus } from './entities/trip.entity';
import { TripsService } from './trips.service';

describe('TripsService', () => {
  let service: TripsService;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };
  let farePricingService: { quote: jest.Mock };

  const validInput: CreateTripDto = {
    pickupAddress: '  نقطة الانطلاق  ',
    pickupLatitude: 30.0131,
    pickupLongitude: 31.2089,
    destinationAddress: '  الوجهة  ',
    destinationLatitude: 30.0444,
    destinationLongitude: 31.2357,
    rideType: TripRideType.ECONOMY,
    passengerCount: 2,
    paymentMethod: TripPaymentMethod.CASH,
    estimatedDistanceMeters: 999999,
    estimatedDurationSeconds: 99999,
  };

  const serverFare = {
    currency: 'EGP',
    estimatedDistanceMeters: 4200,
    estimatedDurationSeconds: 605,
    estimatedFare: 42.5,
    pricingVersion: 'estimate-v1',
    estimateOnly: true,
    note: 'test estimate',
  };

  beforeEach(() => {
    repository = {
      create: jest.fn((value) => value as Trip),
      save: jest.fn(async (value) => ({ ...value, id: 'trip-id' }) as Trip),
      find: jest.fn(async () => []),
    };
    farePricingService = { quote: jest.fn(() => serverFare) };
    service = new TripsService(
      repository as unknown as Repository<Trip>,
      farePricingService as unknown as FarePricingService,
    );
  });

  it('creates a pending trip and stores server-calculated fare, distance and duration', async () => {
    const result = await service.createForRider('rider-id', validInput);

    expect(farePricingService.quote).toHaveBeenCalledWith({
      pickupLatitude: validInput.pickupLatitude,
      pickupLongitude: validInput.pickupLongitude,
      destinationLatitude: validInput.destinationLatitude,
      destinationLongitude: validInput.destinationLongitude,
      rideType: validInput.rideType,
    });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      riderId: 'rider-id',
      pickupAddress: 'نقطة الانطلاق',
      destinationAddress: 'الوجهة',
      passengerCount: 2,
      status: TripStatus.PENDING,
      scheduledAt: null,
      riderNote: null,
      estimatedDistanceMeters: 4200,
      estimatedDurationSeconds: 605,
      fareAmount: 42.5,
      fareCurrency: 'EGP',
      pricingVersion: 'estimate-v1',
    }));
    expect(repository.create).not.toHaveBeenCalledWith(expect.objectContaining({
      estimatedDistanceMeters: 999999,
      estimatedDurationSeconds: 99999,
    }));
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('trip-id');
  });

  it('creates a scooter trip for one passenger', async () => {
    await service.createForRider('rider-id', {
      ...validInput,
      rideType: TripRideType.SCOOTER,
      passengerCount: 1,
    });

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      rideType: TripRideType.SCOOTER,
      passengerCount: 1,
    }));
  });

  it('rejects scooter trips with more than one passenger', async () => {
    await expect(service.createForRider('rider-id', {
      ...validInput,
      rideType: TripRideType.SCOOTER,
      passengerCount: 2,
    })).rejects.toThrow(BadRequestException);

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects trips where the server estimate is zero or too close', async () => {
    farePricingService.quote.mockReturnValue({ ...serverFare, estimatedFare: 0, estimatedDistanceMeters: 0 });

    await expect(service.createForRider('rider-id', validInput)).rejects.toThrow(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects blank pickup or destination addresses', async () => {
    await expect(service.createForRider('rider-id', {
      ...validInput,
      pickupAddress: '   ',
    })).rejects.toThrow(BadRequestException);

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects scheduled trips that are less than five minutes away', async () => {
    const tooSoon = new Date(Date.now() + 60_000).toISOString();
    await expect(service.createForRider('rider-id', {
      ...validInput,
      scheduledAt: tooSoon,
    })).rejects.toThrow(BadRequestException);

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('stores a valid scheduled time as a Date', async () => {
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    await service.createForRider('rider-id', {
      ...validInput,
      scheduledAt: future,
      riderNote: '  اتصل عند الوصول  ',
    });

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      scheduledAt: new Date(future),
      riderNote: 'اتصل عند الوصول',
    }));
  });

  it('returns only the requested rider trips, newest first, capped at 50', async () => {
    await service.findForRider('rider-id');

    expect(repository.find).toHaveBeenCalledWith({
      where: { riderId: 'rider-id' },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  });
});
