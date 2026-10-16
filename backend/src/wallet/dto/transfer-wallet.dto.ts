import { IsInt, IsString, IsUUID, Max, Min, MaxLength } from 'class-validator';

export class TransferWalletDto {
  @IsUUID()
  recipientUserId!: string;

  // Integer piastres; e.g. 1250 = EGP 12.50.
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountMinor!: number;

  // Client-generated UUID reused on retries to prevent duplicate transfers.
  @IsUUID()
  idempotencyKey!: string;

  @IsString()
  @MaxLength(240)
  description!: string;
}
