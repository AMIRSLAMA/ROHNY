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
import { DataSource } from 'typeorm';
import { AuthTokenGuard, AuthenticatedRequest } from '../auth/auth-token.guard';
import { UserRole } from '../users/entities/user.entity';
import { TransferWalletDto } from './dto/transfer-wallet.dto';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(AuthTokenGuard)
export class WalletController {
  constructor(
    private readonly wallets: WalletService,
    private readonly dataSource: DataSource,
  ) {}

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

  @Get('admin/transactions')
  async listAllTransactions(@Req() request: AuthenticatedRequest) {
    if (request.authUser?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }
    return this.dataSource.query(`
      SELECT
        tx.id,
        tx.type,
        tx.amount_minor AS "amountMinor",
        tx.currency,
        tx.description,
        tx.related_trip_id AS "relatedTripId",
        tx.created_at AS "createdAt",
        tx.idempotency_key AS "idempotencyKey",
        creator.email AS "createdByEmail",
        creator.phone AS "createdByPhone",
        source.owner_user_id AS "fromUserId",
        source_user.role AS "fromRole",
        source_user.email AS "fromEmail",
        source_user.phone AS "fromPhone",
        target.owner_user_id AS "toUserId",
        target_user.role AS "toRole",
        target_user.email AS "toEmail",
        target_user.phone AS "toPhone",
        CASE WHEN source.account_type = 'platform' THEN 'platform' ELSE source.account_type END AS "fromAccountType",
        CASE WHEN target.account_type = 'platform' THEN 'platform' ELSE target.account_type END AS "toAccountType"
      FROM wallet_transactions tx
      LEFT JOIN wallet_accounts source ON source.id = tx.from_account_id
      LEFT JOIN users source_user ON source_user.id = source.owner_user_id
      LEFT JOIN wallet_accounts target ON target.id = tx.to_account_id
      LEFT JOIN users target_user ON target_user.id = target.owner_user_id
      LEFT JOIN users creator ON creator.id = tx.created_by_user_id
      ORDER BY tx.created_at DESC
      LIMIT 500
    `);
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
