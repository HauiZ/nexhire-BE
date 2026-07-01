import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JobService } from './job.service';

@ApiTags('jobs')
@Controller('jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}
}
