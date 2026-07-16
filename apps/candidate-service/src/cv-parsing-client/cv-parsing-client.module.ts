import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CvParsingClientService } from './cv-parsing-client.service';

@Module({
  imports: [HttpModule],
  providers: [CvParsingClientService],
  exports: [CvParsingClientService],
})
export class CvParsingClientModule {}
