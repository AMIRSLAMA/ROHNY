import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../users/entities/user.entity';
import { Trip } from './entities/trip.entity';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  // AuthTokenGuard is used by TripsController in this module context.
  // Register User here as well so its injected UserRepository is available.
  imports: [TypeOrmModule.forFeature([Trip, User]), AuthModule],
  controllers: [TripsController],
  providers: [TripsService],
})
export class TripsModule {}
