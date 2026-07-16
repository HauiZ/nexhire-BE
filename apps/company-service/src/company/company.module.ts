import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyController, CompanyInternalController } from './company.controller';
import { CompanyService } from './company.service';
import { CompanyProcessedTrustSignal } from './entities/company-processed-trust-signal.entity';
import { CompanyTrustHistory } from './entities/company-trust-history.entity';
import { Company } from './entities/company.entity';
import { JobReviewTrustSignalConsumer } from './events/consumers/job-review-trust-signal.consumer';
import { CompanyEventPublisher } from './events/company-event.publisher';

@Module({
  imports: [TypeOrmModule.forFeature([Company, CompanyTrustHistory, CompanyProcessedTrustSignal])],
  controllers: [CompanyController, CompanyInternalController],
  providers: [CompanyService, CompanyEventPublisher, JobReviewTrustSignalConsumer],
  exports: [CompanyService],
})
export class CompanyModule {}
