import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface AccessTokenClaims {
  sub: string;
  role: string;
  iat: number;
  exp: number;
}

@Injectable()
export class AuthTokenService {
  private readonly issuer = 'rohny-api';
  private readonly lifetimeSeconds = 15 * 60;

  issueAccessToken(userId: string, role: string) {
    const now = Math.floor(Date.now() / 1000);
    const claims: AccessTokenClaims = {
      sub: userId,
      role,
      iat: now,
      exp: now + this.lifetimeSeconds,
    };
    const header = this.encode({ alg: 'HS256', typ: 'JWT' });
    const payload = this.encode({ iss: this.issuer, ...claims });
    const input = `${header}.${payload}`;
    const token = `${input}.${this.sign(input)}`;
    return { accessToken: token, tokenType: 'Bearer', expiresIn: this.lifetimeSeconds };
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const [headerPart, payloadPart, signature] = parts;
    try {
      const header = JSON.parse(this.decode(headerPart)) as { alg?: string; typ?: string };
      const payload = JSON.parse(this.decode(payloadPart)) as AccessTokenClaims & { iss?: string };
      if (header.alg !== 'HS256' || header.typ !== 'JWT') {
        throw new Error('Unexpected token header');
      }

      const expected = Buffer.from(this.sign(`${headerPart}.${payloadPart}`));
      const received = Buffer.from(signature);
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
        throw new Error('Invalid signature');
      }

      const now = Math.floor(Date.now() / 1000);
      if (
        payload.iss !== this.issuer ||
        typeof payload.sub !== 'string' ||
        typeof payload.role !== 'string' ||
        !Number.isInteger(payload.exp) ||
        payload.exp <= now ||
        !Number.isInteger(payload.iat) ||
        payload.iat > now + 30
      ) {
        throw new Error('Invalid token claims');
      }

      return { sub: payload.sub, role: payload.role, iat: payload.iat, exp: payload.exp };
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private sign(input: string): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'Authentication is not configured: JWT_SECRET must contain at least 32 characters',
      );
    }
    return createHmac('sha256', secret).update(input).digest('base64url');
  }

  private encode(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private decode(value: string): string {
    return Buffer.from(value, 'base64url').toString('utf8');
  }
}
