import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../users/entities/user.entity';
import { WalletAccount } from './entities/wallet-account.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WalletDepositController } from './wallet-deposit.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, WalletAccount, WalletTransaction]),
    AuthModule,
  ],
  controllers: [WalletController, WalletDepositController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
