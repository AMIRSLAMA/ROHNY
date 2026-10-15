import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CreateTripDto } from './dto/create-trip.dto';
import { Trip, TripPaymentMethod, TripRideType, TripStatus } from './entities/trip.entity';
import { TripsService } from './trips.service';

describe('TripsService', () => {
  let service: TripsService;
  let repository: jest.Mocked<Pick<Repository<Trip>, 'create' | 'save' | 'find'>>;

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
  };

  beforeEach(() => {
    repository = {
      create: jest.fn((value) => value as Trip),
      save: jest.fn(async (value) => ({ ...value, id: 'trip-id' }) as Trip),
      find: jest.fn(async () => []),
    };
    service = new TripsService(repository as unknown as Repository<Trip>);
  });

  it('creates a pending trip for the authenticated rider and normalizes text', async () => {
    const result = await service.createForRider('rider-id', validInput);

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      riderId: 'rider-id',
      pickupAddress: 'نقطة الانطلاق',
      destinationAddress: 'الوجهة',
      passengerCount: 2,
      status: TripStatus.PENDING,
      scheduledAt: null,
      riderNote: null,
    }));
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('trip-id');
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
