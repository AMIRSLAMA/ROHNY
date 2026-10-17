import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CreateTripDto } from './dto/create-trip.dto';
import { Trip, TripPaymentMethod, TripRideType, TripStatus } from './entities/trip.entity';
import { TripsService } from './trips.service';

describe('TripsService', () => {
  let service: TripsService;
  let queryBuilder: Record<string, jest.Mock>;
  let pricingService: { quote: jest.Mock };
  let dataSource: { transaction: jest.Mock; query: jest.Mock };
  let managerQuery: jest.Mock;
  let lockedTripRows: any[];
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
    cityCode: 'CAI',
    quotedFareAmount: 45.5,
    quotedCurrency: 'EGP',
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
    pricingService = { quote: jest.fn(async () => ({ cityCode: 'CAI', currency: 'EGP', fareAmount: 45.5, distanceMeters: 6500, durationSeconds: 900 })) };
    lockedTripRows = [{
      id: 'trip-id', rider_id: 'rider-id', driver_id: null, status: TripStatus.PENDING,
      fare_amount: '45.50', fare_currency: 'EGP', rider_free_ride: false, scheduled_at: null,
    }];
    managerQuery = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM trips WHERE id=$1 FOR UPDATE')) return lockedTripRows;
      if (sql.includes('SELECT') && sql.includes('AS earned')) return [{ earned: 0, used: 0, reserved: false }];
      if (sql.includes('setting_value')) return [{ setting_value: 10 }];
      if (sql.includes('SELECT id, balance_minor, currency FROM wallet_accounts WHERE owner_user_id')) {
        return [{ id: 'wallet-id', balance_minor: '10000', currency: 'EGP' }];
      }
      return [];
    });
    const manager = {
      query: managerQuery,
      getRepository: jest.fn(() => repository),
    };
    dataSource = {
      transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<any>) => callback(manager as unknown as EntityManager)),
      query: jest.fn(async () => []),
    };
    service = new TripsService(repository as unknown as Repository<Trip>, pricingService as any, dataSource as unknown as DataSource);
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
      cityCode: 'CAI',
      fareCurrency: 'EGP',
      fareAmount: '45.50',
      fareDistanceMeters: 6500,
      fareDurationSeconds: 900,
      estimatedDistanceMeters: 6500,
      estimatedDurationSeconds: 900,
    }));
    expect(pricingService.quote).toHaveBeenCalledWith(expect.objectContaining({ cityCode: 'CAI', rideType: TripRideType.ECONOMY }));
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
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


  it('checks commission funds and atomically assigns a pending trip to one driver', async () => {
    await service.acceptForDriver('driver-id', 'trip-id');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM trips WHERE id=$1 FOR UPDATE'), ['trip-id']);
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE trips SET driver_id=$1'), ['driver-id', TripStatus.ACCEPTED, 'trip-id', TripStatus.PENDING]);
  });

  it('rejects a trip that another driver already accepted', async () => {
    lockedTripRows = [{
      id: 'trip-id', rider_id: 'rider-id', driver_id: 'another-driver', status: TripStatus.ACCEPTED,
      fare_amount: '45.50', fare_currency: 'EGP', rider_free_ride: false, scheduled_at: null,
    }];
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
