import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AuthTokenGuard,
  AuthenticatedRequest,
} from '../auth/auth-token.guard';
import { UserRole } from '../users/entities/user.entity';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateDriverTripStatusDto } from './dto/update-driver-trip-status.dto';
import { TripsService } from './trips.service';

@Controller('trips')
@UseGuards(AuthTokenGuard)
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateTripDto,
  ) {
    const user = request.authUser!;
    if (user.role !== UserRole.RIDER) {
      throw new ForbiddenException('Only rider accounts can request trips');
    }
    return this.tripsService.createForRider(user.sub, input);
  }

  @Get('mine')
  listMine(@Req() request: AuthenticatedRequest) {
    const user = request.authUser!;
    if (user.role !== UserRole.RIDER) {
      throw new ForbiddenException('Only rider accounts can view rider trips');
    }
    return this.tripsService.findForRider(user.sub);
  }

  @Get('available')
  listAvailableForDrivers(@Req() request: AuthenticatedRequest) {
    if (request.authUser!.role !== UserRole.DRIVER) {
      throw new ForbiddenException('Only driver accounts can view available trips');
    }
    return this.tripsService.findAvailableForDrivers();
  }

  @Post(':tripId/accept')
  acceptTrip(
    @Req() request: AuthenticatedRequest,
    @Param('tripId') tripId: string,
  ) {
    if (request.authUser!.role !== UserRole.DRIVER) {
      throw new ForbiddenException('Only driver accounts can accept trips');
    }
    return this.tripsService.acceptForDriver(request.authUser!.sub, tripId);
  }

  @Patch(':tripId/status')
  updateTripStatus(
    @Req() request: AuthenticatedRequest,
    @Param('tripId') tripId: string,
    @Body() input: UpdateDriverTripStatusDto,
  ) {
    if (request.authUser!.role !== UserRole.DRIVER) {
      throw new ForbiddenException('Only driver accounts can update trip status');
    }
    return this.tripsService.updateStatusForDriver(
      request.authUser!.sub,
      tripId,
      input.status,
    );
  }

  @Post(':tripId/cancel')
  cancelTrip(
    @Req() request: AuthenticatedRequest,
    @Param('tripId') tripId: string,
  ) {
    if (request.authUser!.role !== UserRole.RIDER) {
      throw new ForbiddenException('Only the rider who requested the trip can cancel it');
    }
    return this.tripsService.cancelForRider(request.authUser!.sub, tripId);
  }
}
