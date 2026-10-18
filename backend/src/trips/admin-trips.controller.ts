import {
  Controller,
  ForbiddenException,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthTokenGuard, AuthenticatedRequest } from '../auth/auth-token.guard';
import { UserRole } from '../users/entities/user.entity';

@Controller('admin/trips')
@UseGuards(AuthTokenGuard)
export class AdminTripsController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest) {
    if (request.authUser?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    // Include both account identities so the admin can audit who rode with whom.
    return this.dataSource.query(`
      SELECT
        t.*,
        rider.email AS rider_email,
        rider.phone AS rider_phone,
        rider.role AS rider_role,
        driver.email AS driver_email,
        driver.phone AS driver_phone,
        driver.role AS driver_role,
        driver_profile.full_name AS driver_name,
        driver_profile.vehicle_type AS driver_vehicle_type,
        driver_profile.vehicle_plate AS driver_vehicle_plate
      FROM trips t
      LEFT JOIN users rider ON rider.id = t.rider_id
      LEFT JOIN users driver ON driver.id = t.driver_id
      LEFT JOIN driver_profiles driver_profile ON driver_profile.user_id = driver.id
      ORDER BY t.created_at DESC
      LIMIT 200
    `);
  }
}
