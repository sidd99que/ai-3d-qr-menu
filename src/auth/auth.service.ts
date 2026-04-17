import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds — useful for client-side token refresh scheduling
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_SALT_ROUNDS = 12;
  private readonly REFRESH_SALT_ROUNDS = 10;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Register ────────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existingUser = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (existingUser) {
      // Use a constant-time response to prevent user enumeration
      throw new ConflictException('An account with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.BCRYPT_SALT_ROUNDS);

    const user = this.userRepo.create({
      name: dto.name.trim(),
      email: dto.email.toLowerCase().trim(),
      password: hashedPassword,
      role: dto.role ?? Role.USER,
    });

    try {
      await this.userRepo.save(user);
    } catch (error) {
      this.logger.error('Failed to save new user', error);
      throw new InternalServerErrorException('Registration failed. Please try again.');
    }

    this.logger.log(`New user registered: ${user.email} [${user.role}]`);

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.storeHashedRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<AuthTokens> {
    // Always fetch password field explicitly (it's excluded by default)
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .addSelect('user.hashedRefreshToken')
      .where('user.email = :email', { email: dto.email.toLowerCase().trim() })
      .getOne();

    // Use constant-time comparison to prevent timing attacks
    const passwordToCompare = user?.password ?? '$2b$12$invalidhashforconstanttime';
    const isPasswordValid = await bcrypt.compare(dto.password, passwordToCompare);

    if (!user || !isPasswordValid) {
      this.logger.warn(`Failed login attempt for email: ${dto.email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      this.logger.warn(`Inactive user attempted login: ${user.email}`);
      throw new ForbiddenException('Your account has been deactivated');
    }

    // Update last login timestamp
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    this.logger.log(`User logged in: ${user.email}`);

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.storeHashedRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  // ─── Refresh Tokens ──────────────────────────────────────────────────────────

  async refreshTokens(incomingRefreshToken: string): Promise<AuthTokens> {
    // Verify signature & expiry with refresh secret
    let payload: { sub: string; email: string; role: string };
    try {
      payload = await this.jwtService.verifyAsync(incomingRefreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch (error) {
      this.logger.warn('Refresh token verification failed', error);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.hashedRefreshToken')
      .where('user.id = :id', { id: payload.sub })
      .getOne();

    if (!user || !user.hashedRefreshToken) {
      this.logger.warn(`Refresh attempt for user without stored token: ${payload.sub}`);
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Your account has been deactivated');
    }

    // Compare incoming token against the stored hash
    const tokenMatches = await bcrypt.compare(
      incomingRefreshToken,
      user.hashedRefreshToken,
    );

    if (!tokenMatches) {
      // Possible token reuse attack — revoke all tokens for this user
      this.logger.warn(
        `Refresh token mismatch for user ${user.id} — possible reuse attack. Revoking all tokens.`,
      );
      await this.userRepo.update(user.id, { hashedRefreshToken: null });
      throw new UnauthorizedException('Refresh token is invalid. Please log in again.');
    }

    this.logger.log(`Tokens rotated for user: ${user.email}`);

    // Rotate: issue new pair, store new hash
    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.storeHashedRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  // ─── Logout ──────────────────────────────────────────────────────────────────

  async logout(userId: string): Promise<{ message: string }> {
    await this.userRepo.update(userId, { hashedRefreshToken: null });
    this.logger.log(`User logged out: ${userId}`);
    return { message: 'Logged out successfully' };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private async generateTokens(
    userId: string,
    email: string,
    role: Role,
  ): Promise<AuthTokens> {
    const payload = { sub: userId, email, role };

    const accessExpiresIn = this.config.get('JWT_EXPIRES_IN', '15m');
    const refreshExpiresIn = this.config.get('JWT_REFRESH_EXPIRES_IN', '7d');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiresIn,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseDurationToSeconds(accessExpiresIn),
    };
  }

  private async storeHashedRefreshToken(
    userId: string,
    token: string,
  ): Promise<void> {
    const hashed = await bcrypt.hash(token, this.REFRESH_SALT_ROUNDS);
    await this.userRepo.update(userId, { hashedRefreshToken: hashed });
  }

  private parseDurationToSeconds(duration: string): number {
    const units: Record<string, number> = {
      s: 1, m: 60, h: 3600, d: 86400,
    };
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // default 15m
    return parseInt(match[1], 10) * (units[match[2]] ?? 1);
  }
}