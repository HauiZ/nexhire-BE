import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { CandidateClientService } from './candidate-client.service';

@Module({
  imports: [HttpModule],
  providers: [CandidateClientService],
  exports: [CandidateClientService],
})
export class CandidateClientModule {}
