import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../common/enums/role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password: string;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  @Column({ nullable: true, type: 'text' })
  avatar: string | null;

  @Column({ nullable: true, type: 'text' })
  hashedRefreshToken: string | null;

  @Column({ nullable: true, type: 'timestamp' })
  lastLoginAt: Date | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true, type: 'text' })
  passwordResetToken: string | null;

  @Column({ nullable: true, type: 'timestamp' })
  passwordResetExpiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}