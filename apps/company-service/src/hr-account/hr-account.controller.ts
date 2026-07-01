import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HrAccountService } from './hr-account.service';

@ApiTags('hr-accounts')
@Controller('hr-accounts')
export class HrAccountController {
  constructor(private readonly hrAccountService: HrAccountService) {}
}
