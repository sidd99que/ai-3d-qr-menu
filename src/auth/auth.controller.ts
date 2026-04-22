import {
  Controller, Post, Body, UseGuards,
  Req, HttpCode, HttpStatus, Get, Res
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Public } from '../common/decorators/public.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,  // ← added
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Get('me')
  getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: Request & { user: any }) {
    return this.authService.logout(req.user.sub);
  }

  @Post('admin-action')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  adminOnly(@Req() req: Request & { user: any }) {
    return { message: 'Admin access granted', user: req.user };
  }

  // ── Google OAuth ────────────────────────────────────────────────────────────

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // Passport redirects to Google automatically
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { accessToken, refreshToken } = req.user;
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');

    return res.redirect(
      `${frontendUrl}/auth/google/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`
    );
  }



  // ─── Forgot Password ──────────────────────────────────────────────────────────
@Public()
@Post('forgot-password')
@HttpCode(HttpStatus.OK)
forgotPassword(@Body('email') email: string) {
  return this.authService.forgotPassword(email);
}

// ─── Reset Password ───────────────────────────────────────────────────────────
@Public()
@Post('reset-password')
@HttpCode(HttpStatus.OK)
resetPassword(
  @Body('token') token: string,
  @Body('password') password: string,
) {
  return this.authService.resetPassword(token, password);
}
}