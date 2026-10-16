import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AdminDriversController } from './admin-drivers.controller';
import { AuthModule } from '../auth/auth.module';
import { DriverProfile } from './entities/driver-profile.entity';
import { DriverProfilesController } from './driver-profiles.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, DriverProfile]), AuthModule],
  controllers: [UsersController, AdminDriversController, DriverProfilesController],
  providers: [UsersService],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}
