import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  BadRequestException,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthTokenGuard, AuthenticatedRequest } from '../auth/auth-token.guard';
import { UserRole } from '../users/entities/user.entity';
import { TransferWalletDto } from './dto/transfer-wallet.dto';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(AuthTokenGuard)
export class WalletController {
  constructor(private readonly wallets: WalletService) {}

  @Get('me')
  getMyWallet(
    @Req() request: AuthenticatedRequest,
    @Query('currency') currency?: string,
  ) {
    const user = request.authUser!;
    this.assertWalletUser(user.role);
    return this.wallets.getMyWallet(user.sub, currency);
  }

  @Get('transactions')
  listTransactions(
    @Req() request: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('currency') currency?: string,
  ) {
    const user = request.authUser!;
    this.assertWalletUser(user.role);
    const parsedLimit = limit === undefined ? 50 : Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException('limit must be an integer between 1 and 100');
    }
    return this.wallets.listMyTransactions(user.sub, parsedLimit, currency);
  }

  @Post('transfers')
  transferToCustomer(
    @Req() request: AuthenticatedRequest,
    @Body() input: TransferWalletDto,
  ) {
    const user = request.authUser!;
    if (user.role !== UserRole.DRIVER) {
      throw new ForbiddenException('Only drivers can send wallet transfers to customers');
    }
    return this.wallets.transferDriverToRider(user.sub, input);
  }

  private assertWalletUser(role: string) {
    if (role !== UserRole.RIDER && role !== UserRole.DRIVER) {
      throw new ForbiddenException('Wallets are available to customer and driver accounts');
    }
  }
}
