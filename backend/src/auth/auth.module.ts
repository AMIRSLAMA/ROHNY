import { Module } from '@nestjs/common';
import { AuthTokenService } from './auth-token.service';
import { AuthTokenGuard } from './auth-token.guard';

@Module({
  providers: [AuthTokenService, AuthTokenGuard],
  exports: [AuthTokenService, AuthTokenGuard],
})
export class AuthModule {}
