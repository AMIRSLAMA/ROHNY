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
import { PricingService } from '../pricing/pricing.service';

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripsRepository: Repository<Trip>,
    private readonly pricingService: PricingService,
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

    const fare = await this.pricingService.quote({
      cityCode: input.cityCode,
      rideType: input.rideType,
      pickupLatitude: input.pickupLatitude,
      pickupLongitude: input.pickupLongitude,
      destinationLatitude: input.destinationLatitude,
      destinationLongitude: input.destinationLongitude,
    });
    if (Math.abs(fare.fareAmount - input.quotedFareAmount) >= 0.01 || fare.currency !== input.quotedCurrency.toUpperCase()) {
      throw new ConflictException('Fare or currency changed since your quote. Please review the updated fare and try again.');
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
      cityCode: fare.cityCode,
      fareCurrency: fare.currency,
      fareAmount: fare.fareAmount.toFixed(2),
      fareDistanceMeters: fare.distanceMeters,
      fareDurationSeconds: fare.durationSeconds,
      estimatedDistanceMeters: fare.distanceMeters,
      estimatedDurationSeconds: fare.durationSeconds,
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

  findForDriver(driverId: string) {
    return this.tripsRepository.find({
      where: { driverId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  findAvailableForDrivers(driverId: string) {
    return this.tripsRepository.createQueryBuilder('trip')
      .where('trip.status = :status', { status: TripStatus.PENDING })
      .andWhere('trip.driverId IS NULL')
      .andWhere('(trip.scheduledAt IS NULL OR trip.scheduledAt <= :now)', { now: new Date() })
      .andWhere('NOT (:driverId = ANY(trip.rejectedDriverIds))', { driverId })
      .orderBy('trip.createdAt', 'ASC')
      .take(100)
      .getMany();
  }

  async rejectForDriver(driverId: string, tripId: string) {
    const rows = await this.tripsRepository.query(
      `UPDATE "trips"
       SET "rejected_driver_ids" = array_append("rejected_driver_ids", $1::uuid),
           "updated_at" = now()
       WHERE "id" = $2::uuid
         AND "status" = $3
         AND "driver_id" IS NULL
         AND NOT ($1::uuid = ANY("rejected_driver_ids"))
       RETURNING "id"`,
      [driverId, tripId, TripStatus.PENDING],
    );
    if (!rows.length) {
      const trip = await this.tripsRepository.findOne({ where: { id: tripId } });
      if (!trip) throw new NotFoundException('Trip not found');
      if (trip.status !== TripStatus.PENDING || trip.driverId) {
        throw new ConflictException('Trip is no longer available to reject');
      }
      return { tripId, status: 'already_rejected' };
    }
    return { tripId, status: 'rejected' };
  }

  async acceptForDriver(driverId: string, tripId: string) {
    const result = await this.tripsRepository.createQueryBuilder()
      .update(Trip)
      .set({ driverId, status: TripStatus.ACCEPTED, updatedAt: new Date() })
      .where('"id" = :tripId', { tripId })
      .andWhere('"status" = :pending', { pending: TripStatus.PENDING })
      .andWhere('"driver_id" IS NULL')
      .andWhere('("scheduled_at" IS NULL OR "scheduled_at" <= :now)', { now: new Date() })
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
