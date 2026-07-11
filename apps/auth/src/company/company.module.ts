import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from './entities/company.entity';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { HttpModule } from '@nestjs/axios';
import { JobClient } from './job.client';


@Module({
  imports: [TypeOrmModule.forFeature([Company]),
    HttpModule,
  ],
  controllers: [CompanyController],
  providers: [CompanyService],
  exports: [CompanyService], // Export nếu sau này phần Auth/User cần gọi tới
})
export class CompanyModule {}