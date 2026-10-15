import {
  Controller,
  ForbiddenException,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthTokenGuard, AuthenticatedRequest } from '../auth/auth-token.guard';
import { UserRole } from '../users/entities/user.entity';
import { Trip } from './entities/trip.entity';

@Controller('admin/trips')
@UseGuards(AuthTokenGuard)
export class AdminTripsController {
  constructor(
    @InjectRepository(Trip)
    private readonly trips: Repository<Trip>,
  ) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest) {
    if (request.authUser?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    return this.trips.find({
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }
}
