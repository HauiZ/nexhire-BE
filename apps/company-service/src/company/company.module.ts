import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AdminCompanyController,
  CompanyController,
  CompanyInternalController,
} from './company.controller';
import { CompanyService } from './company.service';
import { CompanyProcessedTrustSignal } from './entities/company-processed-trust-signal.entity';
import { CompanyTrustHistory } from './entities/company-trust-history.entity';
import { CompanyVerificationDocument } from './entities/company-verification-document.entity';
import { Company } from './entities/company.entity';
import { JobReviewTrustSignalConsumer } from './events/consumers/job-review-trust-signal.consumer';
import { CompanyEventPublisher } from './events/company-event.publisher';
import { DocumentClientModule } from '../document-client/document-client.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanyTrustHistory,
      CompanyProcessedTrustSignal,
      CompanyVerificationDocument,
    ]),
    DocumentClientModule,
  ],
  controllers: [CompanyController, AdminCompanyController, CompanyInternalController],
  providers: [CompanyService, CompanyEventPublisher, JobReviewTrustSignalConsumer],
  exports: [CompanyService],
})
export class CompanyModule {}
