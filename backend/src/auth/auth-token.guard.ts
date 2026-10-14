import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthTokenService, AccessTokenClaims } from './auth-token.service';
import { User } from '../users/entities/user.entity';

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  authUser?: AccessTokenClaims;
}

@Injectable()
export class AuthTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: AuthTokenService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer access token is required');
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token || token.includes(' ')) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const claims = this.tokens.verifyAccessToken(token);
    const user = await this.users.findOne({
      select: { id: true, role: true, isActive: true },
      where: { id: claims.sub },
    });

    // Enforce current account status and role, not only token-time claims.
    if (!user || !user.isActive || user.role !== claims.role) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    request.authUser = claims;
    return true;
  }
}
