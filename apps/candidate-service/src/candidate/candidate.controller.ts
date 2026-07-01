import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CandidateService } from './candidate.service';

@ApiTags('candidates')
@Controller('candidates')
export class CandidateController {
  constructor(private readonly candidateService: CandidateService) {}
}
