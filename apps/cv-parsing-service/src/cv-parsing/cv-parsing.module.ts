import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CvParsingController } from './cv-parsing.controller';
import { CvParsingService } from './cv-parsing.service';
import { CvParseRequest } from './entities/cv-parse-request.entity';
import { CvParseResult } from './entities/cv-parse-result.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CvParseRequest, CvParseResult])],
  controllers: [CvParsingController],
  providers: [CvParsingService],
  exports: [CvParsingService],
})
export class CvParsingModule {}
