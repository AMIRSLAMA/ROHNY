import { BadRequestException, Injectable } from '@nestjs/common';
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

    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (scheduledAt && scheduledAt.getTime() < Date.now() + 5 * 60 * 1000) {
      throw new BadRequestException('Scheduled trips must be at least five minutes in the future');
    }

    const trip = this.tripsRepository.create({
      riderId,
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
}
