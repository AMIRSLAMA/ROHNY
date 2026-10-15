import {
  Body,
  Controller,
  ForbiddenException,
  Get,
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
}
