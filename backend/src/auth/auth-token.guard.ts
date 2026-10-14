import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthTokenService, AccessTokenClaims } from './auth-token.service';

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  authUser?: AccessTokenClaims;
}

@Injectable()
export class AuthTokenGuard implements CanActivate {
  constructor(private readonly tokens: AuthTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer access token is required');
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token || token.includes(' ')) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    request.authUser = this.tokens.verifyAccessToken(token);
    return true;
  }
}
