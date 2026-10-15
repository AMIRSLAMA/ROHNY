import { Injectable } from '@nestjs/common';
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
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
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
