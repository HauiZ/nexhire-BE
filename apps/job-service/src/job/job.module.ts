import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanySnapshotService } from './company/company-snapshot.service';
import { ApplicationEventsConsumer } from './consumers/application-events.consumer';
import { CompanySnapshotEventsConsumer } from './consumers/company-snapshot-events.consumer';
import { AdminJobController } from './controllers/admin-job.controller';
import { JobController } from './controllers/job.controller';
import { RecruiterJobController } from './controllers/recruiter-job.controller';
import { JobModerationReview } from './entities/job-moderation-review.entity';
import { JobProcessedApplicationEvent } from './entities/job-processed-application-event.entity';
import { JobRevision } from './entities/job-revision.entity';
import { Job } from './entities/job.entity';
import { JobService } from './job.service';
import { JobModerationService } from './moderation/job-moderation.service';
import { JobSearchTextService } from './search/job-search-text.service';
import { JOB_SEARCH_PROVIDER } from './search/job-search.types';
import { PostgresJobSearchProvider } from './search/postgres-job-search.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job, JobRevision, JobModerationReview, JobProcessedApplicationEvent]),
  ],
  controllers: [JobController, RecruiterJobController, AdminJobController],
  providers: [
    JobService,
    JobModerationService,
    JobSearchTextService,
    PostgresJobSearchProvider,
    { provide: JOB_SEARCH_PROVIDER, useExisting: PostgresJobSearchProvider },
    CompanySnapshotService,
    ApplicationEventsConsumer,
    CompanySnapshotEventsConsumer,
  ],
  exports: [JobService],
})
export class JobModule {}
