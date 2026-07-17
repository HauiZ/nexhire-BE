import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, ApiSuccessResponse, Public } from '@nexhire/shared';
import {
  ManualEmailVerificationDto,
  ManualEmailVerificationResponseDto,
} from './dto/manual-email-verification.dto';
import { ManualAuthService } from './manual-auth.service';

@ApiTags('manual-auth')
@Controller('auth/manual')
export class ManualAuthController {
  constructor(private readonly manualAuthService: ManualAuthService) {}

  @Post('email-verification')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Manual/dev only: create email verification token without sending email',
  })
  @ApiSuccessResponse(ManualEmailVerificationResponseDto)
  @ApiErrorResponses({ statuses: [403, 404, 422, 500] })
  createEmailVerification(
    @Body() dto: ManualEmailVerificationDto,
  ): Promise<ManualEmailVerificationResponseDto> {
    return this.manualAuthService.createEmailVerification(dto);
  }
}
