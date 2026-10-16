import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { AuthTokenService } from '../auth/auth-token.service';
import { User, UserRole } from './entities/user.entity';
import { LoginUserInput, UsersService } from './users.service';

jest.mock('argon2', () => ({
  verify: jest.fn(),
}));

describe('UsersService.login', () => {
  const user = {
    id: 'user-123',
    email: 'rider@example.com',
    phone: '+201001234567',
    passwordHash: 'stored-hash',
    role: UserRole.RIDER,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  } as User;

  let service: UsersService;
  let queryBuilder: {
    addSelect: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };
  let tokens: { issueAccessToken: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(user),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as unknown as Repository<User>;
    tokens = {
      issueAccessToken: jest.fn().mockReturnValue({
        accessToken: 'test-token',
        tokenType: 'Bearer',
        expiresIn: 900,
      }),
    };
    service = new UsersService(repository, tokens as unknown as AuthTokenService);
  });

  it('logs in with a normalized email and returns an access token', async () => {
    const result = await service.login({
      email: '  RIDER@EXAMPLE.COM ',
      password: 'a-long-test-password',
    });

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'user.email = :email',
      { email: 'rider@example.com' },
    );
    expect(argon2.verify).toHaveBeenCalledWith('stored-hash', 'a-long-test-password');
    expect(result.accessToken).toBe('test-token');
  });

  it('logs in with a trimmed phone number', async () => {
    await service.login({
      phone: ' +201001234567 ',
      password: 'a-long-test-password',
    });

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'user.phone = :phone',
      { phone: '+201001234567' },
    );
  });

  it('rejects requests without an email or phone', async () => {
    await expect(
      service.login({ password: 'a-long-test-password' }),
    ).rejects.toThrow(BadRequestException);
    expect(queryBuilder.where).not.toHaveBeenCalled();
  });

  it('rejects requests that contain both email and phone', async () => {
    const input: LoginUserInput = {
      email: 'rider@example.com',
      phone: '+201001234567',
      password: 'a-long-test-password',
    };

    await expect(service.login(input)).rejects.toThrow(BadRequestException);
    expect(queryBuilder.where).not.toHaveBeenCalled();
  });

  it('does not issue a token when the password is wrong', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({ phone: '+201001234567', password: 'wrong-password' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(tokens.issueAccessToken).not.toHaveBeenCalled();
  });

  it('does not issue a token for inactive accounts', async () => {
    queryBuilder.getOne.mockResolvedValue({ ...user, isActive: false });

    await expect(
      service.login({ email: 'rider@example.com', password: 'a-long-test-password' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(tokens.issueAccessToken).not.toHaveBeenCalled();
  });
});
