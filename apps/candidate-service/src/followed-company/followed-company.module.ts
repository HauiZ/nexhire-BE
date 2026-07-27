import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandidateProfile } from '../candidate/entities/candidate-profile.entity';
import { DocumentClientModule } from '../document-client/document-client.module';
import { JobSnapshotClient } from '../saved-job/job-snapshot.client';
import { CompanySnapshotClient } from './company-snapshot.client';
import { FollowedCompany } from './entities/followed-company.entity';
import { FollowedCompanyController } from './followed-company.controller';
import { FollowedCompanyEventPublisher } from './followed-company-event.publisher';
import { FollowedCompanyService } from './followed-company.service';
import { JobPublishedFollowConsumer } from './job-published-follow.consumer';

@Module({
  imports: [
    HttpModule,
    DocumentClientModule,
    TypeOrmModule.forFeature([CandidateProfile, FollowedCompany]),
  ],
  controllers: [FollowedCompanyController],
  providers: [
    CompanySnapshotClient,
    FollowedCompanyEventPublisher,
    FollowedCompanyService,
    JobPublishedFollowConsumer,
    JobSnapshotClient,
  ],
  exports: [FollowedCompanyService],
})
export class FollowedCompanyModule {}
