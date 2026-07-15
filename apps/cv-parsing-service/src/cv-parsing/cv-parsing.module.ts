import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CvParsingController } from './cv-parsing.controller';
import { CvParsingService } from './cv-parsing.service';
import { CvParseRequest } from './entities/cv-parse-request.entity';
import { CvParseResult } from './entities/cv-parse-result.entity';
import { SkimaModule } from '../skima/skima.module';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([CvParseRequest, CvParseResult]), SkimaModule],
  controllers: [CvParsingController],
  providers: [CvParsingService],
  exports: [CvParsingService],
})
export class CvParsingModule {}
