import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum WalletAccountType {
  USER = 'user',
  PLATFORM = 'platform',
}

@Entity({ name: 'wallet_accounts' })
@Index('UQ_wallet_accounts_owner_currency', ['ownerUserId', 'currency'], {
  unique: true,
  where: '"owner_user_id" IS NOT NULL',
})
@Index('UQ_wallet_accounts_platform_currency', ['accountType', 'currency'], {
  unique: true,
  where: '"account_type" = \'platform\'',
})
@Check('CHK_wallet_accounts_balance_nonnegative', '"balance_minor" >= 0')
export class WalletAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'owner_user_id', type: 'uuid', nullable: true })
  ownerUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_user_id' })
  ownerUser!: User | null;

  @Column({ name: 'account_type', type: 'varchar', length: 10 })
  accountType!: WalletAccountType;

  @Column({ type: 'varchar', length: 3, default: 'EGP' })
  currency!: string;

  // Store integer minor units; the scale depends on the currency.
  @Column({ name: 'balance_minor', type: 'bigint', default: 0 })
  balanceMinor!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
