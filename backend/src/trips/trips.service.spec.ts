import { BadRequestException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CreateTripDto } from './dto/create-trip.dto';
import { Trip, TripPaymentMethod, TripRideType, TripStatus } from './entities/trip.entity';
import { TripsService } from './trips.service';

describe('TripsService', () => {
  let service: TripsService;
  let queryBuilder: Record<string, jest.Mock>;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

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
    queryBuilder = {};
    for (const method of ['update', 'set', 'where', 'andWhere', 'orderBy', 'take']) {
      queryBuilder[method] = jest.fn(() => queryBuilder);
    }
    queryBuilder.execute = jest.fn(async () => ({ affected: 1 }));
    queryBuilder.getMany = jest.fn(async () => []);
    repository = {
      create: jest.fn((value) => value as Trip),
      save: jest.fn(async (value) => ({ ...value, id: 'trip-id' }) as Trip),
      find: jest.fn(async () => []),
      findOne: jest.fn(async ({ where }) => ({ id: where?.id ?? 'trip-id', riderId: where?.riderId ?? 'rider-id', driverId: 'driver-id', status: TripStatus.ACCEPTED }) as Trip),
      createQueryBuilder: jest.fn(() => queryBuilder),
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


  it('atomically assigns a pending trip to one driver', async () => {
    await service.acceptForDriver('driver-id', 'trip-id');
    expect(queryBuilder.update).toHaveBeenCalledWith(Trip);
    expect(queryBuilder.set).toHaveBeenCalledWith(expect.objectContaining({ driverId: 'driver-id', status: TripStatus.ACCEPTED }));
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('"driver_id" IS NULL');
  });

  it('rejects a trip that another driver already accepted', async () => {
    queryBuilder.execute.mockResolvedValueOnce({ affected: 0 });
    await expect(service.acceptForDriver('driver-id', 'trip-id')).rejects.toThrow(ConflictException);
  });

  it('allows only the assigned driver to advance a trip through valid states', async () => {
    await service.updateStatusForDriver('driver-id', 'trip-id', TripStatus.DRIVER_ARRIVING);
    expect(queryBuilder.where).toHaveBeenCalledWith('"id" = :tripId', { tripId: 'trip-id' });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('"driver_id" = :driverId', { driverId: 'driver-id' });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('"status" = :expectedStatus', { expectedStatus: TripStatus.ACCEPTED });
  });

  it('rejects skipping the trip lifecycle', async () => {
    await expect(service.updateStatusForDriver('driver-id', 'trip-id', TripStatus.CANCELLED)).rejects.toThrow(BadRequestException);
  });

  it('returns only trips assigned to the authenticated driver', async () => {
    await service.findForDriver('driver-id');

    expect(repository.find).toHaveBeenCalledWith({
      where: { driverId: 'driver-id' },
      order: { createdAt: 'DESC' },
      take: 50,
    });
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
