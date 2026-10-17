import {
  BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException,
  Param, Patch, Put, Req, UseGuards
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, Max, Matches } from 'class-validator';
import { Repository } from 'typeorm';
import { AuthTokenGuard, AuthenticatedRequest } from '../auth/auth-token.guard';
import { UserRole } from './entities/user.entity';
import { DriverProfile } from './entities/driver-profile.entity';

const IMAGE_KEYS = ['profilePhoto', 'vehiclePhoto', 'nationalIdFront', 'nationalIdBack', 'drivingLicenseFront', 'drivingLicenseBack', 'vehicleLicenseFront', 'vehicleLicenseBack'] as const;
type ImageKey = typeof IMAGE_KEYS[number];

class SaveDriverProfileDto {
  @IsOptional() @IsString() @MaxLength(160) fullName?: string;
  @IsOptional() @IsString() @MaxLength(40) nationalIdNumber?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) nationalIdExpiry?: string;
  @IsOptional() @IsString() @MaxLength(40) vehicleType?: string;
  @IsOptional() @IsString() @MaxLength(80) vehicleMake?: string;
  @IsOptional() @IsString() @MaxLength(80) vehicleModel?: string;
  @IsOptional() @IsInt() @Min(1950) @Max(2100) vehicleYear?: number;
  @IsOptional() @IsString() @MaxLength(40) vehicleColor?: string;
  @IsOptional() @IsString() @MaxLength(30) vehiclePlate?: string;
  @IsOptional() @IsString() @MaxLength(50) drivingLicenseNumber?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) drivingLicenseExpiry?: string;
  @IsOptional() @IsString() @MaxLength(50) vehicleLicenseNumber?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) vehicleLicenseExpiry?: string;
  @IsOptional() images?: Record<string, string>;
}

class ReviewDriverProfileDto {
  @IsIn(['approved', 'needs_changes']) status!: 'approved' | 'needs_changes';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@Controller()
@UseGuards(AuthTokenGuard)
export class DriverProfilesController {
  constructor(@InjectRepository(DriverProfile) private readonly profiles: Repository<DriverProfile>) {}

  private assertDriver(request: AuthenticatedRequest) {
    if (request.authUser?.role !== UserRole.DRIVER) throw new ForbiddenException('Captain access required');
    return request.authUser.sub;
  }

  private assertAdmin(request: AuthenticatedRequest) {
    if (request.authUser?.role !== UserRole.ADMIN) throw new ForbiddenException('Admin access required');
    return request.authUser.sub;
  }

  @Get('driver-profile/me')
  async mine(@Req() request: AuthenticatedRequest) {
    const userId = this.assertDriver(request);
    let profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) profile = await this.profiles.save(this.profiles.create({ userId, images: {} }));
    return profile;
  }

  @Put('driver-profile/me')
  async saveMine(@Req() request: AuthenticatedRequest, @Body() input: SaveDriverProfileDto) {
    const userId = this.assertDriver(request);
    let profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) profile = this.profiles.create({ userId, images: {} });
    const { images, ...fields } = input;
    Object.assign(profile, fields);
    if (images !== undefined) {
      if (!images || typeof images !== 'object' || Array.isArray(images)) throw new BadRequestException('Invalid images object');
      const updated = { ...(profile.images || {}) };
      for (const [key, value] of Object.entries(images)) {
        if (!(IMAGE_KEYS as readonly string[]).includes(key)) throw new BadRequestException('Unknown image field');
        if (value === null || value === '') { delete updated[key]; continue; }
        if (typeof value !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(value) || value.length > 2_800_000) {
          throw new BadRequestException('Each image must be a JPEG, PNG, or WebP image under 2 MB');
        }
        updated[key as ImageKey] = value;
      }
      profile.images = updated;
    }
    profile.reviewStatus = 'pending';
    profile.reviewNote = '';
    profile.reviewedBy = null;
    profile.reviewedAt = null;
    return this.profiles.save(profile);
  }

  @Get('admin/driver-profiles')
  async all(@Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    return this.profiles.find({ order: { updatedAt: 'DESC' } });
  }

  @Patch('admin/driver-profiles/:id/review')
  async review(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: ReviewDriverProfileDto) {
    const adminId = this.assertAdmin(request);
    const profile = await this.profiles.findOne({ where: { id } });
    if (!profile) throw new NotFoundException('Driver profile not found');
    profile.reviewStatus = input.status;
    profile.reviewNote = input.note?.trim() || '';
    profile.reviewedBy = adminId;
    profile.reviewedAt = new Date();
    return this.profiles.save(profile);
  }
}
