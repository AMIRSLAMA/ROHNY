import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Get,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UsersService } from './users.service';
import { AuthTokenGuard, AuthenticatedRequest } from '../auth/auth-token.guard';
import { AuthRateLimitGuard } from '../auth/auth-rate-limit.guard';

class RegisterUserDto {
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

class LoginUserDto {
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

@Controller('auth')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.CREATED)
  register(@Body() input: RegisterUserDto) {
    return this.usersService.register(input);
  }

  @Post('login')
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  login(@Body() input: LoginUserDto) {
    if (Boolean(input.email?.trim()) === Boolean(input.phone?.trim())) {
      throw new BadRequestException('Provide either email or phone number');
    }
    return this.usersService.login(input);
  }

  @Get('me')
  @UseGuards(AuthTokenGuard)
  me(@Req() request: AuthenticatedRequest) {
    return { userId: request.authUser!.sub, role: request.authUser!.role };
  }
}
