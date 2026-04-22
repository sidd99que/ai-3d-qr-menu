import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { MailService } from '../mail/mail.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';
import { UserProfile } from '../common/interfaces/user-profile.interface';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { StringValue } from 'ms';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_SALT_ROUNDS = 12;
  private readonly REFRESH_SALT_ROUNDS = 10;
  usersService: any;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
     private readonly mailService: MailService, 
  ) {}

  // ─── Register ────────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<AuthTokens> {
    try {
      const existingUser = await this.userRepo.findOne({
        where: { email: dto.email.toLowerCase().trim() },
      });

      if (existingUser) {
        throw new ConflictException('An account with this email already exists');
      }

      const hashedPassword = await bcrypt.hash(dto.password, this.BCRYPT_SALT_ROUNDS);

      const user = this.userRepo.create({
        name: dto.name.trim(),
        email: dto.email.toLowerCase().trim(),
        password: hashedPassword,
        role: dto.role ?? Role.USER,
      });

      await this.userRepo.save(user);

      this.logger.log(`New user registered: ${user.email} [${user.role}]`);

      const tokens = await this.generateTokens(user.id, user.email, user.role);
      await this.storeHashedRefreshToken(user.id, tokens.refreshToken);

      return tokens;
    } catch (error) {
      // Re-throw NestJS HTTP exceptions as-is
      if (error instanceof ConflictException) throw error;

      this.logger.error(
        `Registration failed for email: ${dto.email}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException('Registration failed. Please try again.');
    }
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<AuthTokens> {
    try {
      const user = await this.userRepo
        .createQueryBuilder('user')
        .addSelect('user.password')
        .addSelect('user.hashedRefreshToken')
        .where('user.email = :email', { email: dto.email.toLowerCase().trim() })
        .getOne();

      // Constant-time comparison to prevent timing attacks
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

      await this.userRepo.update(user.id, { lastLoginAt: new Date() });

      this.logger.log(`User logged in: ${user.email}`);

      const tokens = await this.generateTokens(user.id, user.email, user.role);
      await this.storeHashedRefreshToken(user.id, tokens.refreshToken);

      return tokens;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) throw error;

      this.logger.error(
        `Login failed for email: ${dto.email}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException('Login failed. Please try again.');
    }
  }

  // ─── Refresh Tokens ──────────────────────────────────────────────────────────

  async refreshTokens(incomingRefreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(incomingRefreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch (error) {
      this.logger.warn(
        'Refresh token verification failed',
        error instanceof Error ? error.message : String(error),
      );
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    try {
      const user = await this.userRepo
        .createQueryBuilder('user')
        .addSelect('user.hashedRefreshToken')
        .where('user.id = :id', { id: payload.sub })
        .getOne();

      if (!user || !user.hashedRefreshToken) {
        this.logger.warn(
          `Refresh attempt for user without stored token: ${payload.sub}`,
        );
        throw new UnauthorizedException('Refresh token has been revoked');
      }

      if (!user.isActive) {
        throw new ForbiddenException('Your account has been deactivated');
      }

      const tokenMatches = await bcrypt.compare(
        incomingRefreshToken,
        user.hashedRefreshToken,
      );

      if (!tokenMatches) {
        // Possible reuse attack — revoke all tokens immediately
        this.logger.warn(
          `Refresh token mismatch for user ${user.id} — possible reuse attack. Revoking all tokens.`,
        );
        await this.userRepo.update(user.id, { hashedRefreshToken: null });
        throw new UnauthorizedException('Refresh token is invalid. Please log in again.');
      }

      this.logger.log(`Tokens rotated for user: ${user.email}`);

      const tokens = await this.generateTokens(user.id, user.email, user.role);
      await this.storeHashedRefreshToken(user.id, tokens.refreshToken);

      return tokens;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) throw error;

      this.logger.error(
        `Token refresh failed for user: ${payload.sub}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException('Token refresh failed. Please log in again.');
    }
  }

  // ─── Logout ──────────────────────────────────────────────────────────────────

  async logout(userId: string): Promise<{ message: string }> {
    try {
      await this.userRepo.update(userId, { hashedRefreshToken: null });
      this.logger.log(`User logged out: ${userId}`);
      return { message: 'Logged out successfully' };
    } catch (error) {
      this.logger.error(
        `Logout failed for user: ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException('Logout failed. Please try again.');
    }
  }

  // ─── Get Me ──────────────────────────────────────────────────────────────────

  async getMe(userId: string): Promise<UserProfile> {
    try {
      const user = await this.userRepo.findOne({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });

      if (!user) {
        throw new NotFoundException(`User not found`);
      }

      this.logger.log(`Profile fetched for user: ${user.email}`);

      return user;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;

      this.logger.error(
        `Failed to fetch profile for user: ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException('Could not fetch profile. Please try again.');
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

 private async generateTokens(
  userId: string,
  email: string,
  role: Role,
): Promise<AuthTokens> {
  const accessExpiresIn  = this.config.getOrThrow<string>('JWT_EXPIRES_IN') as StringValue;
  const refreshExpiresIn = this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN') as StringValue;

  try {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, role },
        {
          secret: this.config.getOrThrow<string>('JWT_SECRET'),
          expiresIn: accessExpiresIn,
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email, role },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: refreshExpiresIn,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseDurationToSeconds(accessExpiresIn),
    };
  } catch (error) {
    this.logger.error(
      `Token generation failed for user: ${userId}`,
      error instanceof Error ? error.stack : String(error),
    );
    throw new InternalServerErrorException('Token generation failed.');
  }
}
  private async storeHashedRefreshToken(
    userId: string,
    token: string,
  ): Promise<void> {
    try {
      const hashed = await bcrypt.hash(token, this.REFRESH_SALT_ROUNDS);
      await this.userRepo.update(userId, { hashedRefreshToken: hashed });
    } catch (error) {
      this.logger.error(
        `Failed to store refresh token for user: ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException('Failed to store refresh token.');
    }
  }

  private parseDurationToSeconds(duration: string): number {
    const units: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // default 15m
    return parseInt(match[1], 10) * (units[match[2]] ?? 1);
  }



async findOrCreateGoogleUser(profile: {
  email: string;
  name: string;
  avatar: string;
  googleId: string;
}) {
  let user = await this.userRepo.findOne({
    where: { email: profile.email.toLowerCase().trim() },
  });

  if (!user) {
    const hashedPassword = await bcrypt.hash(crypto.randomUUID(), this.BCRYPT_SALT_ROUNDS);

    user = this.userRepo.create({
      email:    profile.email.toLowerCase().trim(),
      name:     profile.name,
      password: hashedPassword,
      role:     Role.USER,
    });

    await this.userRepo.save(user);
    this.logger.log(`New Google user created: ${user.email}`);
  }

  const tokens = await this.generateTokens(user.id, user.email, user.role);
  await this.storeHashedRefreshToken(user.id, tokens.refreshToken);

  return { user, ...tokens };
}




// ─── Forgot Password ──────────────────────────────────────────────────────────
async forgotPassword(email: string): Promise<{ message: string }> {
  try {
    const user = await this.userRepo.findOne({
      where: { email: email.toLowerCase().trim() },
    });

    // Always return success — don't reveal if email exists
    if (!user) {
      this.logger.warn(`Password reset requested for unknown email: ${email}`);
      return { message: 'If that email exists, a reset link has been sent.' };
    }

    // Generate secure token
    const resetToken   = crypto.randomBytes(32).toString('hex');
    const hashedToken  = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt    = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.userRepo.update(user.id, {
      passwordResetToken:     hashedToken,
      passwordResetExpiresAt: expiresAt,
    });

    await this.mailService.sendPasswordResetEmail(user.email, resetToken);

    this.logger.log(`Password reset email sent to: ${user.email}`);
    return { message: 'If that email exists, a reset link has been sent.' };
  } catch (error) {
    this.logger.error(`Forgot password failed for: ${email}`, error);
    throw new InternalServerErrorException('Failed to send reset email. Please try again.');
  }
}

// ─── Reset Password ───────────────────────────────────────────────────────────
async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  try {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.userRepo.findOne({
      where: { passwordResetToken: hashedToken },
    });

    if (!user || !user.passwordResetExpiresAt) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    if (user.passwordResetExpiresAt < new Date()) {
      throw new UnauthorizedException('Reset token has expired. Please request a new one.');
    }

    const hashedPassword = await bcrypt.hash(newPassword, this.BCRYPT_SALT_ROUNDS);

    await this.userRepo.update(user.id, {
      password:               hashedPassword,
      passwordResetToken:     null,
      passwordResetExpiresAt: null,
      hashedRefreshToken:     null, // force logout everywhere
    });

    this.logger.log(`Password reset successful for: ${user.email}`);
    return { message: 'Password reset successful. You can now log in.' };
  } catch (error) {
    if (error instanceof UnauthorizedException) throw error;
    this.logger.error('Reset password failed', error);
    throw new InternalServerErrorException('Password reset failed. Please try again.');
  }
}
}