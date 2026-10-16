import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateTripDto } from './dto/create-trip.dto';
import { FarePricingService } from './fare-pricing.service';
import { Trip, TripStatus } from './entities/trip.entity';

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripsRepository: Repository<Trip>,
    private readonly farePricingService: FarePricingService,
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

    // Never trust client-supplied distance or duration for fare calculation/storage.
    const fare = this.farePricingService.quote({
      pickupLatitude: input.pickupLatitude,
      pickupLongitude: input.pickupLongitude,
      destinationLatitude: input.destinationLatitude,
      destinationLongitude: input.destinationLongitude,
      rideType: input.rideType,
    });

    if (fare.estimatedFare <= 0 || fare.estimatedDistanceMeters <= 0) {
      throw new BadRequestException('Pickup and destination must be far enough apart to request a trip');
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
      estimatedDistanceMeters: fare.estimatedDistanceMeters,
      estimatedDurationSeconds: fare.estimatedDurationSeconds,
      fareAmount: fare.estimatedFare,
      fareCurrency: fare.currency,
      pricingVersion: fare.pricingVersion,
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
