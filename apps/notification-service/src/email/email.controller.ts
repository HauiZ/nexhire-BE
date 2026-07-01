import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EmailService } from './email.service';

@ApiTags('notifications-email')
@Controller('notifications/email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}
}
