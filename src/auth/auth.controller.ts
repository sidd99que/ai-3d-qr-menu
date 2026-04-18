// auth/auth.controller.ts
import {
  Controller, Post, Body, UseGuards,
  Req, HttpCode, HttpStatus, Get
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()               // ✅ No token — user doesn't have one yet
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()               // ✅ No token — user is trying to get one
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()               // ✅ No access token — only a refresh token is used here
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }


  @Get('me')
getMe(@CurrentUser() user: JwtPayload) {
  return this.authService.getMe(user.sub);
}
  

  @Post('logout')         // 🔒 Must be logged in to log out
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: Request & { user: any }) {
    return this.authService.logout(req.user.sub);
  }

  @Post('admin-action')   // 🔒 Protected + role check
  @UseGuards(RolesGuard)  // ⚠️ Remove JwtAuthGuard here — global guard already handles JWT
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  adminOnly(@Req() req: Request & { user: any }) {
    return { message: 'Admin access granted', user: req.user };
  }
}