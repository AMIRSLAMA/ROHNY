import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthTokenService } from './auth-token.service';
import { AuthTokenGuard } from './auth-token.guard';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [AuthTokenService, AuthTokenGuard, AuthRateLimitGuard],
  exports: [AuthTokenService, AuthTokenGuard, AuthRateLimitGuard],
})
export class AuthModule {}
