import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthTokenService } from './auth-token.service';
import { AuthTokenGuard } from './auth-token.guard';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [AuthTokenService, AuthTokenGuard],
  exports: [AuthTokenService, AuthTokenGuard],
})
export class AuthModule {}
