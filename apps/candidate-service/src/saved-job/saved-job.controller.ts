import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SavedJobService } from './saved-job.service';

@ApiTags('saved-jobs')
@Controller('saved-jobs')
export class SavedJobController {
  constructor(private readonly savedJobService: SavedJobService) {}
}
