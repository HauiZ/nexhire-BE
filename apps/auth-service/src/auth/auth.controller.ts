import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, ApiSuccessResponse, CurrentUser, Public, AuthUser } from '@nexhire/shared';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangePasswordResponseDto } from './dto/change-password-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ForgotPasswordResponseDto } from './dto/forgot-password-response.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutResponseDto } from './dto/logout-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResendVerificationResponseDto } from './dto/resend-verification-response.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResetPasswordResponseDto } from './dto/reset-password-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyEmailResponseDto } from './dto/verify-email-response.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register a new candidate or recruiter account' })
  @ApiSuccessResponse(AuthResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [400, 409, 422, 500] })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiSuccessResponse(AuthResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 422, 500] })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate refresh token and issue a new token pair' })
  @ApiSuccessResponse(AuthResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 422, 500] })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refreshToken(dto);
  }

  @Post('logout')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke the current refresh token' })
  @ApiSuccessResponse(LogoutResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 422, 500] })
  logout(@Body() dto: RefreshTokenDto): Promise<LogoutResponseDto> {
    return this.authService.logout(dto);
  }

  @Post('verify-email')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify a user email with verification token' })
  @ApiSuccessResponse(VerifyEmailResponseDto)
  @ApiErrorResponses({ statuses: [400, 404, 422, 500] })
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<VerifyEmailResponseDto> {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-verification')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Resend email verification token with anti-spam limits' })
  @ApiSuccessResponse(ResendVerificationResponseDto)
  @ApiErrorResponses({ statuses: [400, 404, 409, 422, 429, 500] })
  resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<ResendVerificationResponseDto> {
    return this.authService.resendVerification(dto);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Request a password reset token by email' })
  @ApiSuccessResponse(ForgotPasswordResponseDto)
  @ApiErrorResponses({ statuses: [400, 422, 429, 500] })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<ForgotPasswordResponseDto> {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset password with email and reset token' })
  @ApiSuccessResponse(ResetPasswordResponseDto)
  @ApiErrorResponses({ statuses: [400, 404, 422, 500] })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<ResetPasswordResponseDto> {
    return this.authService.resetPassword(dto);
  }

  @Post('change-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Change password for the authenticated user' })
  @ApiBearerAuth()
  @ApiSuccessResponse(ChangePasswordResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 404, 422, 500] })
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<ChangePasswordResponseDto> {
    return this.authService.changePassword(user.id, dto);
  }
}
