import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { AuthTokenService } from './auth-token.service';

describe('AuthTokenService', () => {
  const previousSecret = process.env.JWT_SECRET;
  let service: AuthTokenService;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    service = new AuthTokenService();
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  it('issues and verifies a short-lived access token', () => {
    const issued = service.issueAccessToken('user-123', 'rider');
    expect(issued.tokenType).toBe('Bearer');
    expect(issued.expiresIn).toBe(900);
    expect(service.verifyAccessToken(issued.accessToken)).toMatchObject({
      sub: 'user-123',
      role: 'rider',
    });
  });

  it('rejects tampered tokens', () => {
    const token = service.issueAccessToken('user-123', 'rider').accessToken;
    expect(() => service.verifyAccessToken(token + 'x')).toThrow(UnauthorizedException);
  });

  it('rejects malformed tokens', () => {
    expect(() => service.verifyAccessToken('not.a.jwt')).toThrow(UnauthorizedException);
  });

  it('fails closed when no sufficiently long secret is configured', () => {
    process.env.JWT_SECRET = 'short';
    expect(() => service.issueAccessToken('user-123', 'rider')).toThrow(
      InternalServerErrorException,
    );
  });
});
