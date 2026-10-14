import { ExecutionContext, HttpException } from '@nestjs/common';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

describe('AuthRateLimitGuard', () => {
  let guard: AuthRateLimitGuard;
  let request: { ip: string; url: string };
  let setHeader: jest.Mock;
  let context: ExecutionContext;

  beforeEach(() => {
    guard = new AuthRateLimitGuard();
    request = { ip: '192.0.2.10', url: '/auth/login' };
    setHeader = jest.fn();
    context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;
  });

  it('allows the configured number of login attempts', () => {
    for (let i = 0; i < 10; i += 1) {
      expect(guard.canActivate(context)).toBe(true);
    }
  });

  it('blocks the next login attempt and provides Retry-After', () => {
    for (let i = 0; i < 10; i += 1) guard.canActivate(context);

    expect(() => guard.canActivate(context)).toThrow(HttpException);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('uses a separate limit for registration', () => {
    request.url = '/auth/register';
    for (let i = 0; i < 5; i += 1) expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow(TooManyRequestsException);
  });

  it('does not apply to unrelated routes', () => {
    request.url = '/auth/me';
    for (let i = 0; i < 20; i += 1) expect(guard.canActivate(context)).toBe(true);
  });

  it('tracks different client IP addresses separately', () => {
    for (let i = 0; i < 10; i += 1) guard.canActivate(context);
    request.ip = '192.0.2.11';
    expect(guard.canActivate(context)).toBe(true);
  });
});
