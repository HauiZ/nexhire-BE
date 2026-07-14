import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';

import { Company } from './entities/company.entity';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { JobClient } from './job.client';

@Module({
  imports: [TypeOrmModule.forFeature([Company]), HttpModule],
  controllers: [CompanyController],
  providers: [CompanyService, JobClient],
  exports: [CompanyService],
})
export class CompanyModule {}
