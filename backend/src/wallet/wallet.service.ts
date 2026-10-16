import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
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

  private normalizeCurrency(value?: string): string {
    const currency = (value || 'EGP').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('currency must be a three-letter ISO 4217 currency code');
    }
    try {
      new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions();
    } catch {
      throw new BadRequestException('Unsupported currency code');
    }
    return currency;
  }

  private fractionDigits(currency: string): number {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits;
  }

  private formatMoney(minor: string, currency: string): string {
    const digits = this.fractionDigits(currency);
    const amount = BigInt(minor);
    const scale = 10n ** BigInt(digits);
    const whole = amount / scale;
    if (digits === 0) return whole.toString();
    const fraction = (amount % scale).toString().padStart(digits, '0');
    return whole.toString() + '.' + fraction;
  }

  private async ensureUserAccount(
    userId: string,
    currencyValue = 'EGP',
    manager: EntityManager = this.dataSource.manager,
  ) {
    const currency = this.normalizeCurrency(currencyValue);
    await manager.query(
      `INSERT INTO "wallet_accounts" ("account_type", "currency", "balance_minor")
       VALUES ('platform', $1, 0) ON CONFLICT DO NOTHING`,
      [currency],
    );
    await manager.query(
      `INSERT INTO "wallet_accounts" ("owner_user_id", "account_type", "currency", "balance_minor")
       VALUES ($1, 'user', $2, 0)
       ON CONFLICT ("owner_user_id", "currency") WHERE "owner_user_id" IS NOT NULL DO NOTHING`,
      [userId, currency],
    );
    const account = await manager.getRepository(WalletAccount).findOne({
      where: { ownerUserId: userId, currency },
    });
    if (!account) throw new NotFoundException('Wallet account could not be created');
    return account;
  }

  async getMyWallet(userId: string, currencyValue = 'EGP') {
    const currency = this.normalizeCurrency(currencyValue);
    const account = await this.ensureUserAccount(userId, currency);
    const balance = this.formatMoney(account.balanceMinor, currency);
    return {
      walletId: account.id,
      currency,
      balanceMinor: account.balanceMinor,
      balance,
      ...(currency === 'EGP' ? { balanceEgp: balance } : {}),
      minorUnitDigits: this.fractionDigits(currency),
      walletKind: 'internal',
    };
  }

  async listMyTransactions(userId: string, limit = 50, currencyValue = 'EGP') {
    const currency = this.normalizeCurrency(currencyValue);
    const account = await this.ensureUserAccount(userId, currency);
    const entries = await this.transactions.createQueryBuilder('entry')
      .where('(entry.fromAccountId = :accountId OR entry.toAccountId = :accountId)', { accountId: account.id })
      .andWhere('entry.currency = :currency', { currency })
      .orderBy('entry.createdAt', 'DESC')
      .take(Math.min(Math.max(limit, 1), 100))
      .getMany();

    return entries.map((entry) => {
      const amount = this.formatMoney(entry.amountMinor, currency);
      return {
        id: entry.id,
        type: entry.type,
        direction: entry.toAccountId === account.id ? 'credit' : 'debit',
        amountMinor: entry.amountMinor,
        amount,
        ...(currency === 'EGP' ? { amountEgp: amount } : {}),
        currency: entry.currency,
        description: entry.description,
        relatedTripId: entry.relatedTripId,
        createdAt: entry.createdAt,
      };
    });
  }

  async transferDriverToRider(senderId: string, input: TransferWalletDto) {
    if (senderId === input.recipientUserId) {
      throw new BadRequestException('You cannot transfer to your own wallet');
    }
    const currency = this.normalizeCurrency(input.currency);
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
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.idempotencyKey]);
      const senderAccount = await this.ensureUserAccount(senderId, currency, manager);
      const recipientAccount = await this.ensureUserAccount(input.recipientUserId, currency, manager);
      const existing = await manager.getRepository(WalletTransaction).findOne({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (
          existing.createdByUserId === senderId &&
          existing.fromAccountId === senderAccount.id &&
          existing.toAccountId === recipientAccount.id &&
          existing.amountMinor === amount.toString() &&
          existing.currency === currency &&
          existing.type === WalletTransactionType.TRANSFER
        ) {
          const formatted = this.formatMoney(existing.amountMinor, currency);
          return {
            transactionId: existing.id,
            status: 'completed',
            amountMinor: existing.amountMinor,
            amount: formatted,
            ...(currency === 'EGP' ? { amountEgp: formatted } : {}),
            currency,
            duplicateRequest: true,
          };
        }
        throw new ConflictException('Idempotency key has already been used for a different transaction');
      }
      const ids = [senderAccount.id, recipientAccount.id].sort();
      const locked = await manager.query(
        'SELECT "id", "owner_user_id", "balance_minor", "currency" FROM "wallet_accounts" WHERE "id" = ANY($1::uuid[]) ORDER BY "id" FOR UPDATE',
        [ids],
      );
      const senderRow = locked.find((row: { owner_user_id: string }) => row.owner_user_id === senderId);
      const recipientRow = locked.find((row: { owner_user_id: string }) => row.owner_user_id === input.recipientUserId);
      if (!senderRow || !recipientRow) throw new NotFoundException('Wallet account not found');
      if (senderRow.currency !== currency || recipientRow.currency !== currency) {
        throw new BadRequestException('Transfers require both wallets to use the same currency');
      }
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
          currency,
          idempotencyKey: input.idempotencyKey,
          description: input.description.trim() || 'Driver-to-customer wallet transfer',
        }),
      );
      const formatted = this.formatMoney(saved.amountMinor, currency);

      return {
        transactionId: saved.id,
        status: 'completed',
        amountMinor: saved.amountMinor,
        amount: formatted,
        ...(currency === 'EGP' ? { amountEgp: formatted } : {}),
        currency,
        duplicateRequest: false,
      };
    });
  }
}
