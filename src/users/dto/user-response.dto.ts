import { Role } from '../../common/enums/role.enum';

export class UserResponseDto {
  id:          string;
  name:        string;
  email:       string;
  role:        Role;
  avatar:      string | null;
  isActive:    boolean;
  lastLoginAt: Date | null;
  createdAt:   Date;
  updatedAt:   Date;

  constructor(user: Partial<UserResponseDto>) {
    Object.assign(this, user);
  }

  static from(user: any): UserResponseDto {
    return new UserResponseDto({
      id:          user.id,
      name:        user.name,
      email:       user.email,
      role:        user.role,
      avatar:      user.avatar ?? null,
      isActive:    user.isActive,
      lastLoginAt: user.lastLoginAt ?? null,
      createdAt:   user.createdAt,
      updatedAt:   user.updatedAt,
    });
  }
}