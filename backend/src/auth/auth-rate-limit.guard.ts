import {
  CanActivate,
  ExecutionContext,
  Injectable,
  TooManyRequestsException,
} from '@nestjs/common';

interface RateLimitRequest {
  ip?: string;
  url?: string;
  socket?: { remoteAddress?: string };
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, RateLimitEntry>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RateLimitRequest>();
    const response = context.switchToHttp().getResponse<{
      setHeader: (name: string, value: string) => void;
    }>();
    const path = (request.url ?? '').split('?')[0];
    const isLogin = path.endsWith('/login');
    const isRegister = path.endsWith('/register');

    if (!isLogin && !isRegister) return true;

    const now = Date.now();
    const windowMs = isLogin ? 15 * 60 * 1000 : 60 * 60 * 1000;
    const limit = isLogin ? 10 : 5;
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    const key = `${path}:${ip}`;
    let entry = this.attempts.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      this.attempts.set(key, entry);
    }

    if (entry.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      response.setHeader('Retry-After', String(retryAfter));
      throw new TooManyRequestsException('Too many authentication attempts. Try again later.');
    }

    entry.count += 1;

    // Bound memory usage and discard expired counters opportunistically.
    if (this.attempts.size > 10000) {
      for (const [storedKey, storedEntry] of this.attempts) {
        if (storedEntry.resetAt <= now) this.attempts.delete(storedKey);
      }
      if (this.attempts.size > 10000) {
        const firstKey = this.attempts.keys().next().value;
        if (firstKey !== undefined) this.attempts.delete(firstKey);
      }
    }

    return true;
  }
}
