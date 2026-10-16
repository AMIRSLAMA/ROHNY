import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { WalletAccount } from './entities/wallet-account.entity';
import { WalletTransaction, WalletTransactionType } from './entities/wallet-transaction.entity';
import { TransferWalletDto } from './dto/transfer-wallet.dto';

@Injectable()
export class WalletService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(WalletAccount) private readonly accounts: Repository<WalletAccount>,
    @InjectRepository(WalletTransaction) private readonly transactions: Repository<WalletTransaction>,
  ) {}

  private async ensureUserAccount(userId: string, manager = this.dataSource.manager) {
    await manager.query(
      `INSERT INTO "wallet_accounts" ("owner_user_id", "account_type", "currency", "balance_minor")
       VALUES ($1, 'user', 'EGP', 0) ON CONFLICT ("owner_user_id") WHERE "owner_user_id" IS NOT NULL DO NOTHING`,
      [userId],
    );
    const account = await manager.getRepository(WalletAccount).findOne({ where: { ownerUserId: userId } });
    if (!account) throw new NotFoundException('Wallet account could not be created');
    return account;
  }

  private formatMoney(minor: string) {
    const amount = BigInt(minor);
    const whole = amount / 100n;
    const fraction = (amount % 100n).toString().padStart(2, '0');
    return whole.toString() + '.' + fraction;
  }

  async getMyWallet(userId: string) {
    const account = await this.ensureUserAccount(userId);
    return {
      walletId: account.id,
      currency: 'EGP',
      balanceMinor: account.balanceMinor,
      balanceEgp: this.formatMoney(account.balanceMinor),
      walletKind: 'internal',
    };
  }

  async listMyTransactions(userId: string, limit = 50) {
    const account = await this.ensureUserAccount(userId);
    const entries = await this.transactions.createQueryBuilder('entry')
      .where('entry.fromAccountId = :accountId OR entry.toAccountId = :accountId', { accountId: account.id })
      .orderBy('entry.createdAt', 'DESC')
      .take(Math.min(Math.max(limit, 1), 100))
      .getMany();

    return entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      direction: entry.toAccountId === account.id ? 'credit' : 'debit',
      amountMinor: entry.amountMinor,
      amountEgp: this.formatMoney(entry.amountMinor),
      currency: entry.currency,
      description: entry.description,
      relatedTripId: entry.relatedTripId,
      createdAt: entry.createdAt,
    }));
  }

  async transferDriverToRider(senderId: string, input: TransferWalletDto) {
    if (senderId === input.recipientUserId) {
      throw new BadRequestException('You cannot transfer to your own wallet');
    }
    const amount = BigInt(input.amountMinor);
    if (amount <= 0n) throw new BadRequestException('Transfer amount must be positive');

    const recipient = await this.users.findOne({
      select: { id: true, role: true, isActive: true },
      where: { id: input.recipientUserId },
    });
    if (!recipient || !recipient.isActive) throw new NotFoundException('Recipient account not found');
    if (recipient.role !== UserRole.RIDER) {
      throw new BadRequestException('Wallet transfers can only be sent to a customer account');
    }

    return this.dataSource.transaction(async (manager) => {
      // Serialize retries with the same key before checking the ledger.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.idempotencyKey]);
      const senderAccount = await this.ensureUserAccount(senderId, manager);
      const recipientAccount = await this.ensureUserAccount(input.recipientUserId, manager);
      const existing = await manager.getRepository(WalletTransaction).findOne({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (
          existing.createdByUserId === senderId &&
          existing.fromAccountId === senderAccount.id &&
          existing.toAccountId === recipientAccount.id &&
          existing.amountMinor === amount.toString() &&
          existing.type === WalletTransactionType.TRANSFER
        ) {
          return {
            transactionId: existing.id,
            status: 'completed',
            amountMinor: existing.amountMinor,
            amountEgp: this.formatMoney(existing.amountMinor),
            currency: 'EGP',
            duplicateRequest: true,
          };
        }
        throw new ConflictException('Idempotency key has already been used for a different transaction');
      }
      const ids = [senderAccount.id, recipientAccount.id].sort();
      const locked = await manager.query(
        'SELECT "id", "owner_user_id", "balance_minor" FROM "wallet_accounts" WHERE "id" = ANY($1::uuid[]) ORDER BY "id" FOR UPDATE',
        [ids],
      );
      const senderRow = locked.find((row: { owner_user_id: string }) => row.owner_user_id === senderId);
      const recipientRow = locked.find((row: { owner_user_id: string }) => row.owner_user_id === input.recipientUserId);
      if (!senderRow || !recipientRow) throw new NotFoundException('Wallet account not found');
      if (BigInt(senderRow.balance_minor) < amount) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      await manager.query(
        'UPDATE "wallet_accounts" SET "balance_minor" = "balance_minor" - $1, "updated_at" = now() WHERE "id" = $2',
        [amount.toString(), senderRow.id],
      );
      await manager.query(
        'UPDATE "wallet_accounts" SET "balance_minor" = "balance_minor" + $1, "updated_at" = now() WHERE "id" = $2',
        [amount.toString(), recipientRow.id],
      );
      const saved = await manager.getRepository(WalletTransaction).save(
        manager.getRepository(WalletTransaction).create({
          fromAccountId: senderRow.id,
          toAccountId: recipientRow.id,
          createdByUserId: senderId,
          type: WalletTransactionType.TRANSFER,
          amountMinor: amount.toString(),
          currency: 'EGP',
          idempotencyKey: input.idempotencyKey,
          description: input.description.trim() || 'Driver-to-customer wallet transfer',
        }),
      );

      return {
        transactionId: saved.id,
        status: 'completed',
        amountMinor: saved.amountMinor,
        amountEgp: this.formatMoney(saved.amountMinor),
        currency: 'EGP',
        duplicateRequest: false,
      };
    });
  }
}
