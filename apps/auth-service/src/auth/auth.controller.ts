import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, ApiSuccessResponse, Public } from '@nexhire/shared';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResendVerificationResponseDto } from './dto/resend-verification-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyEmailResponseDto } from './dto/verify-email-response.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register a new candidate account' })
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
}
