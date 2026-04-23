import {
  Controller, Get, Patch, Post, Delete,
  Body, Param, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { Role } from '../common/enums/role.enum';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── Current User ─────────────────────────────────────────────────────────────

  @Get('me')
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.usersService.getProfile(user.sub);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(user.sub, dto);
  }

  @Post('me/change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(user.sub, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  deactivateAccount(@CurrentUser() user: JwtPayload) {
    return this.usersService.deactivateAccount(user.sub);
  }

  // ── Admin Only ───────────────────────────────────────────────────────────────

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  updateRole(
    @Param('id') id: string,
    @Body('role') role: Role,
  ) {
    return this.usersService.updateRole(id, role);
  }

  @Patch(':id/toggle-active')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  toggleActive(@Param('id') id: string) {
    return this.usersService.toggleActive(id);
  }
}