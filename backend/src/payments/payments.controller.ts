import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { AuthTokenGuard, AuthenticatedRequest } from '../auth/auth-token.guard';
import { UserRole } from '../users/entities/user.entity';
import { PaymentsService, PaymentPurpose } from './payments.service';

class CreateCardCheckoutDto {
  @IsIn(['trip_fare', 'rider_wallet_topup', 'driver_commission', 'driver_wallet_topup'])
  purpose!: PaymentPurpose;

  @IsOptional()
  @IsUUID()
  tripId?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(100000000)
  amountMinor?: number;

  @IsOptional()
  @IsString()
  currency?: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('webhooks/paymob')
  @HttpCode(200)
  handlePaymobWebhook(@Body() body: Record<string, any>, @Headers('hmac') hmac?: string) {
    return this.payments.handlePaymobWebhook(body, hmac);
  }

  @Post('card/checkout')
  @UseGuards(AuthTokenGuard)
  createCheckout(@Req() request: AuthenticatedRequest, @Body() input: CreateCardCheckoutDto, @Headers('idempotency-key') idempotencyKey?: string) {
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 180) {
      throw new BadRequestException('A unique Idempotency-Key header between 8 and 180 characters is required');
    }
    return this.payments.createCheckout(request.authUser!.sub, request.authUser!.role, input, idempotencyKey);
  }

  @Get('mine')
  @UseGuards(AuthTokenGuard)
  listMine(@Req() request: AuthenticatedRequest) {
    const user = request.authUser!;
    if (![UserRole.RIDER, UserRole.DRIVER, UserRole.ADMIN].includes(user.role as UserRole)) {
      throw new BadRequestException('Unsupported account role');
    }
    return this.payments.listMine(user.sub, user.role);
  }
}
