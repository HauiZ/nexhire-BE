import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WebPushService } from './web-push.service';

@ApiTags('notifications-web-push')
@Controller('notifications/web-push')
export class WebPushController {
  constructor(private readonly webPushService: WebPushService) {}
}
