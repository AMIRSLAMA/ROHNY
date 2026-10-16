import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateTripDto } from './dto/create-trip.dto';
import { Trip, TripStatus } from './entities/trip.entity';

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripsRepository: Repository<Trip>,
  ) {}

  async createForRider(riderId: string, input: CreateTripDto) {
    if (!input.pickupAddress.trim() || !input.destinationAddress.trim()) {
      throw new BadRequestException('Pickup and destination addresses are required');
    }

    if (input.rideType === 'scooter' && input.passengerCount !== 1) {
      throw new BadRequestException('Scooter trips allow one passenger only');
    }

    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (scheduledAt && scheduledAt.getTime() < Date.now() + 5 * 60 * 1000) {
      throw new BadRequestException('Scheduled trips must be at least five minutes in the future');
    }

    const trip = this.tripsRepository.create({
      riderId,
      driverId: null,
      pickupAddress: input.pickupAddress.trim(),
      pickupLatitude: input.pickupLatitude,
      pickupLongitude: input.pickupLongitude,
      destinationAddress: input.destinationAddress.trim(),
      destinationLatitude: input.destinationLatitude,
      destinationLongitude: input.destinationLongitude,
      rideType: input.rideType,
      passengerCount: input.passengerCount,
      paymentMethod: input.paymentMethod,
      scheduledAt,
      riderNote: input.riderNote?.trim() || null,
      estimatedDistanceMeters: input.estimatedDistanceMeters ?? null,
      estimatedDurationSeconds: input.estimatedDurationSeconds ?? null,
      status: TripStatus.PENDING,
    });

    return this.tripsRepository.save(trip);
  }

  findForRider(riderId: string) {
    return this.tripsRepository.find({
      where: { riderId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  findAvailableForDrivers() {
    return this.tripsRepository.createQueryBuilder('trip')
      .where('trip.status = :status', { status: TripStatus.PENDING })
      .andWhere('(trip.scheduledAt IS NULL OR trip.scheduledAt <= :now)', { now: new Date() })
      .orderBy('trip.createdAt', 'ASC')
      .take(100)
      .getMany();
  }

  async acceptForDriver(driverId: string, tripId: string) {
    const result = await this.tripsRepository.createQueryBuilder()
      .update(Trip)
      .set({ driverId, status: TripStatus.ACCEPTED, updatedAt: new Date() })
      .where('"id" = :tripId', { tripId })
      .andWhere('"status" = :pending', { pending: TripStatus.PENDING })
      .andWhere('"driver_id" IS NULL')
      .execute();

    if (!result.affected) {
      throw new ConflictException('Trip is no longer available to accept');
    }

    const trip = await this.tripsRepository.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  async updateStatusForDriver(driverId: string, tripId: string, nextStatus: TripStatus) {
    const previousStatus: Partial<Record<TripStatus, TripStatus>> = {
      [TripStatus.DRIVER_ARRIVING]: TripStatus.ACCEPTED,
      [TripStatus.IN_PROGRESS]: TripStatus.DRIVER_ARRIVING,
      [TripStatus.COMPLETED]: TripStatus.IN_PROGRESS,
    };
    const expectedStatus = previousStatus[nextStatus];
    if (!expectedStatus) {
      throw new BadRequestException('Unsupported driver trip status transition');
    }

    const result = await this.tripsRepository.createQueryBuilder()
      .update(Trip)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where('"id" = :tripId', { tripId })
      .andWhere('"driver_id" = :driverId', { driverId })
      .andWhere('"status" = :expectedStatus', { expectedStatus })
      .execute();

    if (!result.affected) {
      throw new ConflictException('Trip is not assigned to you or its status has changed');
    }

    const trip = await this.tripsRepository.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  async cancelForRider(riderId: string, tripId: string) {
    const result = await this.tripsRepository.createQueryBuilder()
      .update(Trip)
      .set({ status: TripStatus.CANCELLED, driverId: null, updatedAt: new Date() })
      .where('"id" = :tripId', { tripId })
      .andWhere('"rider_id" = :riderId', { riderId })
      .andWhere('"status" IN (:...cancellable)', {
        cancellable: [TripStatus.PENDING, TripStatus.ACCEPTED],
      })
      .execute();

    if (!result.affected) {
      const trip = await this.tripsRepository.findOne({ where: { id: tripId, riderId } });
      if (!trip) throw new NotFoundException('Trip not found');
      throw new ConflictException('This trip can no longer be cancelled');
    }

    return this.tripsRepository.findOne({ where: { id: tripId, riderId } });
  }
}
