import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanySnapshotService } from './company/company-snapshot.service';
import { AdminJobController } from './controllers/admin-job.controller';
import { JobController, JobInternalController } from './controllers/job.controller';
import { RecruiterJobController } from './controllers/recruiter-job.controller';
import { JobModerationReview } from './entities/job-moderation-review.entity';
import { JobProcessedApplicationEvent } from './entities/job-processed-application-event.entity';
import { JobRevision } from './entities/job-revision.entity';
import { Job } from './entities/job.entity';
import { JobExpirationScheduler } from './job-expiration.scheduler';
import { JobService } from './job.service';
import { ApplicationEventsConsumer } from './events/consumers/application-events.consumer';
import { CompanySnapshotEventsConsumer } from './events/consumers/company-snapshot-events.consumer';
import { JobEventPublisher } from './events/job-event.publisher';
import { JobModerationService } from './moderation/job-moderation.service';
import { JobSearchTextService } from './search/job-search-text.service';
import { JOB_SEARCH_PROVIDER } from './search/job-search.types';
import { PostgresJobSearchProvider } from './search/postgres-job-search.provider';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([Job, JobRevision, JobModerationReview, JobProcessedApplicationEvent]),
  ],
  controllers: [JobController, JobInternalController, RecruiterJobController, AdminJobController],
  providers: [
    JobService,
    JobModerationService,
    JobSearchTextService,
    JobEventPublisher,
    PostgresJobSearchProvider,
    { provide: JOB_SEARCH_PROVIDER, useExisting: PostgresJobSearchProvider },
    JobExpirationScheduler,
    CompanySnapshotService,
    ApplicationEventsConsumer,
    CompanySnapshotEventsConsumer,
  ],
  exports: [JobService],
})
export class JobModule {}
