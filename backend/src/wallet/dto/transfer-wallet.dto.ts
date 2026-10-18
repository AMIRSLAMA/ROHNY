import {
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  Max,
  Min,
  IsOptional,
  Matches,
} from 'class-validator';

export class TransferWalletDto {
  @IsUUID()
  tripId!: string;

  // Integer minor units; scale depends on currency (for example, 1250 = EGP 12.50).
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountMinor!: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  // The driver confirms that the rider verbally agreed to receive the change in their ROHNY wallet.
  @IsBoolean()
  consentConfirmed!: boolean;

  // Client-generated UUID reused on retries to prevent duplicate transfers.
  @IsUUID()
  idempotencyKey!: string;
}
