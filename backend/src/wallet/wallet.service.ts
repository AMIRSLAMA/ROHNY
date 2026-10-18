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
    }).resolvedOptions().maximumFractionDigits ?? 2;
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
    if (!input.consentConfirmed) {
      throw new BadRequestException('The rider verbal consent must be confirmed before transfer');
    }
    const currency = this.normalizeCurrency(input.currency);
    const amount = BigInt(input.amountMinor);
    if (amount <= 0n) throw new BadRequestException('Transfer amount must be positive');

    return this.dataSource.transaction(async (manager) => {
      // Lock the trip so the same completed trip cannot issue more than one change transfer.
      const tripRows = await manager.query(
        'SELECT id, rider_id, driver_id, status, fare_currency, fare_amount FROM trips WHERE id=$1 FOR UPDATE',
        [input.tripId],
      );
      const trip = tripRows[0];
      if (!trip) throw new NotFoundException('Trip not found');
      if (trip.driver_id !== senderId) {
        throw new BadRequestException('Only the captain assigned to this trip can transfer change');
      }
      if (trip.status !== 'completed') {
        throw new BadRequestException('Change can be transferred only after the trip is completed');
      }
      if (trip.fare_currency !== currency) {
        throw new BadRequestException('Transfer currency must match the trip currency');
      }
      const fareValue = Number(trip.fare_amount);
      if (!Number.isFinite(fareValue) || fareValue <= 0) {
        throw new BadRequestException('Trip fare is not valid for a change transfer');
      }
      const fareMinor = BigInt(Math.round(fareValue * (10 ** this.fractionDigits(currency))));
      if (amount > fareMinor) {
        throw new BadRequestException('Change transfer cannot exceed the trip fare');
      }
      if (!trip.rider_id || trip.rider_id === senderId) {
        throw new BadRequestException('Trip customer account is not valid for this transfer');
      }

      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.idempotencyKey]);
      const senderAccount = await this.ensureUserAccount(senderId, currency, manager);
      const recipientAccount = await this.ensureUserAccount(trip.rider_id, currency, manager);
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
          existing.type === WalletTransactionType.TRANSFER &&
          existing.relatedTripId === input.tripId
        ) {
          const formatted = this.formatMoney(existing.amountMinor, currency);
          return {
            transactionId: existing.id,
            tripId: input.tripId,
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

      const previousTripTransfer = await manager.getRepository(WalletTransaction).findOne({
        where: {
          relatedTripId: input.tripId,
          fromAccountId: senderAccount.id,
          toAccountId: recipientAccount.id,
          type: WalletTransactionType.TRANSFER,
        },
      });
      if (previousTripTransfer) {
        throw new ConflictException('Change has already been transferred for this trip');
      }

      const ids = [senderAccount.id, recipientAccount.id].sort();
      const locked = await manager.query(
        'SELECT "id", "owner_user_id", "balance_minor", "currency" FROM "wallet_accounts" WHERE "id" = ANY($1::uuid[]) ORDER BY "id" FOR UPDATE',
        [ids],
      );
      const senderRow = locked.find((row: { owner_user_id: string }) => row.owner_user_id === senderId);
      const recipientRow = locked.find((row: { owner_user_id: string }) => row.owner_user_id === trip.rider_id);
      if (!senderRow || !recipientRow) throw new NotFoundException('Wallet account not found');
      if (senderRow.currency !== currency || recipientRow.currency !== currency) {
        throw new BadRequestException('Transfers require both wallets to use the same currency');
      }
      if (BigInt(senderRow.balance_minor) < amount) {
        throw new BadRequestException('Insufficient wallet balance to transfer the rider change');
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
          relatedTripId: input.tripId,
          description: 'تسوية باقي نقدي للراكب بعد موافقته الشفهية',
        }),
      );
      const formatted = this.formatMoney(saved.amountMinor, currency);

      return {
        transactionId: saved.id,
        tripId: input.tripId,
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
