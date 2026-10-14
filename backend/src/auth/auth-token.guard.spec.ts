import { UnauthorizedException } from '@nestjs/common';
import { AuthTokenGuard, AuthenticatedRequest } from './auth-token.guard';
import { AuthTokenService } from './auth-token.service';
import { User } from '../users/entities/user.entity';

describe('AuthTokenGuard', () => {
  const claims = { sub: 'user-123', role: 'rider' as const };
  let request: AuthenticatedRequest;
  let guard: AuthTokenGuard;
  let tokens: { verifyAccessToken: jest.Mock };
  let users: { findOne: jest.Mock };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;

  beforeEach(() => {
    request = { headers: { authorization: 'Bearer valid.token.value' } };
    tokens = { verifyAccessToken: jest.fn().mockReturnValue(claims) };
    users = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-123',
        role: 'rider',
        isActive: true,
      }),
    };
    guard = new AuthTokenGuard(
      tokens as unknown as AuthTokenService,
      users as unknown as import('typeorm').Repository<User>,
    );
  });

  it('allows an active account with the same current role', async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.authUser).toEqual(claims);
    expect(users.findOne).toHaveBeenCalledWith({
      select: { id: true, role: true, isActive: true },
      where: { id: 'user-123' },
    });
  });

  it('rejects a deleted or missing account', async () => {
    users.findOne.mockResolvedValue(null);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a deactivated account', async () => {
    users.findOne.mockResolvedValue({ id: 'user-123', role: 'rider', isActive: false });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token when the account role has changed', async () => {
    users.findOne.mockResolvedValue({ id: 'user-123', role: 'driver', isActive: true });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects requests without a bearer token before querying the account', async () => {
    request.headers.authorization = undefined;
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(users.findOne).not.toHaveBeenCalled();
  });
});
