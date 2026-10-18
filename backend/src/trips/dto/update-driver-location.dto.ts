import { IsNumber, IsOptional, Max, Min } from 'class-validator';
export class UpdateDriverLocationDto {
  @IsNumber({allowNaN:false,allowInfinity:false}) @Min(-90) @Max(90) latitude!: number;
  @IsNumber({allowNaN:false,allowInfinity:false}) @Min(-180) @Max(180) longitude!: number;
  @IsOptional() @IsNumber({allowNaN:false,allowInfinity:false}) @Min(0) @Max(100000) accuracyMeters?: number | null;
  @IsOptional() @IsNumber({allowNaN:false,allowInfinity:false}) @Min(0) @Max(360) headingDegrees?: number | null;
  @IsOptional() @IsNumber({allowNaN:false,allowInfinity:false}) @Min(0) @Max(500) speedMetersPerSecond?: number | null;
}