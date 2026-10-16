import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { WalletAccount } from './wallet-account.entity';

export enum WalletTransactionType {
  TRANSFER = 'transfer',
  TRIP_PAYMENT = 'trip_payment',
  PLATFORM_COMMISSION = 'platform_commission',
  CARD_TOP_UP = 'card_top_up',
  REFUND = 'refund',
  CASH_OUT = 'cash_out',
}

@Entity({ name: 'wallet_transactions' })
@Index('IDX_wallet_transactions_from_created', ['fromAccountId', 'createdAt'])
@Index('IDX_wallet_transactions_to_created', ['toAccountId', 'createdAt'])
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'from_account_id', type: 'uuid', nullable: true })
  fromAccountId!: string | null;

  @ManyToOne(() => WalletAccount, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'from_account_id' })
  fromAccount!: WalletAccount | null;

  @Column({ name: 'to_account_id', type: 'uuid', nullable: true })
  toAccountId!: string | null;

  @ManyToOne(() => WalletAccount, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'to_account_id' })
  toAccount!: WalletAccount | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: User | null;

  @Column({ type: 'varchar', length: 30 })
  type!: WalletTransactionType;

  @Column({ name: 'amount_minor', type: 'bigint' })
  amountMinor!: string;

  @Column({ type: 'varchar', length: 3, default: 'EGP' })
  currency!: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 100, unique: true })
  idempotencyKey!: string;

  @Column({ name: 'related_trip_id', type: 'uuid', nullable: true })
  relatedTripId!: string | null;

  @Column({ type: 'varchar', length: 240, nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
