import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { User, UserRole } from './entities/user.entity';

export interface RegisterUserInput {
  email?: string;
  phone?: string;
  password: string;
}

export interface LoginUserInput {
  email: string;
  password: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async register(input: RegisterUserInput) {
    const email = input.email?.trim().toLowerCase() || null;
    const phone = input.phone?.trim() || null;
    const password = input.password;

    if (!email && !phone) {
      throw new BadRequestException(
        'Email or phone number is required',
      );
    }

    if (typeof password !== 'string' || password.length < 12) {
      throw new BadRequestException(
        'Password must be at least 12 characters',
      );
    }

    const existing = await this.usersRepository.findOne({
      where: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
      ],
    });

    if (existing) {
      throw new ConflictException(
        'Email or phone number is already registered',
      );
    }

    const passwordHash = await argon2.hash(password);

    const user = this.usersRepository.create({
      email,
      phone,
      passwordHash,
      role: UserRole.RIDER,
    });

    try {
      const saved = await this.usersRepository.save(user);

      return {
        id: saved.id,
        email: saved.email,
        phone: saved.phone,
        role: saved.role,
        createdAt: saved.createdAt,
      };
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException(
          'Email or phone number is already registered',
        );
      }

      throw error;
    }
  }

  async login(input: LoginUserInput) {
    const email = input.email.trim().toLowerCase();
    const password = input.password;

    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();

    // Keep the response identical for unknown accounts and wrong passwords.
    if (!user || !user.passwordHash || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      password,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}
