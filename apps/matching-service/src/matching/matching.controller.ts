import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MatchingService } from './matching.service';

@ApiTags('matching')
@Controller('matching')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}
}
