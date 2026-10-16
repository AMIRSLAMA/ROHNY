import {
  IsInt,
  IsString,
  IsUUID,
  Max,
  Min,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';

export class TransferWalletDto {
  @IsUUID()
  recipientUserId!: string;

  // Integer minor units; scale depends on currency (for example, 1250 = EGP 12.50).
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountMinor!: number;

  // Optional for compatibility; defaults to EGP for existing clients.
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  // Client-generated UUID reused on retries to prevent duplicate transfers.
  @IsUUID()
  idempotencyKey!: string;

  @IsString()
  @MaxLength(240)
  description!: string;
}
