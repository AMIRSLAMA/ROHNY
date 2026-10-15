import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../users/entities/user.entity';
import { Trip } from './entities/trip.entity';
import { AdminTripsController } from './admin-trips.controller';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  // Register User here because AuthTokenGuard injects its repository.
  imports: [TypeOrmModule.forFeature([Trip, User]), AuthModule],
  controllers: [TripsController, AdminTripsController],
  providers: [TripsService],
})
export class TripsModule {}
