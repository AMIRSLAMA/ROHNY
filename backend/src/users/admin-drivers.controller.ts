import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthTokenGuard, AuthenticatedRequest } from '../auth/auth-token.guard';
import { UserRole } from './entities/user.entity';
import { UsersService } from './users.service';

class CreateDriverDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

@Controller('admin/drivers')
@UseGuards(AuthTokenGuard)
export class AdminDriversController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateDriverDto) {
    if (request.authUser?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }
    return this.usersService.createDriver(input);
  }
}
