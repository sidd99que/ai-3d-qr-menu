import {
  Injectable, Logger, NotFoundException,
  BadRequestException, InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // ─── Get Profile ─────────────────────────────────────────────────────────────
  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return UserResponseDto.from(user);
  }

  // ─── Update Profile ───────────────────────────────────────────────────────────
  async updateProfile(userId: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    try {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');

      Object.assign(user, dto);
      await this.userRepo.save(user);

      this.logger.log(`Profile updated for user: ${user.email}`);
      return UserResponseDto.from(user);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Update profile failed for: ${userId}`, error);
      throw new InternalServerErrorException('Failed to update profile');
    }
  }

  // ─── Change Password ──────────────────────────────────────────────────────────
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    try {
      const user = await this.userRepo
        .createQueryBuilder('user')
        .addSelect('user.password')
        .where('user.id = :id', { id: userId })
        .getOne();

      if (!user) throw new NotFoundException('User not found');

      const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
      if (!isMatch) throw new BadRequestException('Current password is incorrect');

      if (dto.currentPassword === dto.newPassword) {
        throw new BadRequestException('New password must be different from current password');
      }

      const hashed = await bcrypt.hash(dto.newPassword, this.BCRYPT_ROUNDS);
      await this.userRepo.update(userId, {
        password:           hashed,
        hashedRefreshToken: null, // force logout everywhere
      });

      this.logger.log(`Password changed for user: ${user.email}`);
      return { message: 'Password changed successfully' };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) throw error;
      this.logger.error(`Change password failed for: ${userId}`, error);
      throw new InternalServerErrorException('Failed to change password');
    }
  }

  // ─── Deactivate Account ───────────────────────────────────────────────────────
  async deactivateAccount(userId: string): Promise<{ message: string }> {
    try {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');

      await this.userRepo.update(userId, {
        isActive:           false,
        hashedRefreshToken: null,
      });

      this.logger.log(`Account deactivated: ${user.email}`);
      return { message: 'Account deactivated successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Deactivate account failed for: ${userId}`, error);
      throw new InternalServerErrorException('Failed to deactivate account');
    }
  }

  // ─── Admin: Get All Users ─────────────────────────────────────────────────────
  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.userRepo.find({
      order: { createdAt: 'DESC' },
    });
    return users.map(UserResponseDto.from);
  }

  // ─── Admin: Get User By Id ────────────────────────────────────────────────────
  async findById(userId: string): Promise<UserResponseDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return UserResponseDto.from(user);
  }

  // ─── Admin: Update User Role ──────────────────────────────────────────────────
  async updateRole(userId: string, role: Role): Promise<UserResponseDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    await this.userRepo.update(userId, { role });
    this.logger.log(`Role updated to ${role} for user: ${user.email}`);
    return UserResponseDto.from({ ...user, role });
  }

  // ─── Admin: Toggle Active ─────────────────────────────────────────────────────
  async toggleActive(userId: string): Promise<UserResponseDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    await this.userRepo.update(userId, { isActive: !user.isActive });
    this.logger.log(`User ${user.email} isActive → ${!user.isActive}`);
    return UserResponseDto.from({ ...user, isActive: !user.isActive });
  }
}