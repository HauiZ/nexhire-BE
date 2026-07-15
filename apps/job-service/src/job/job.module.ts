import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminJobController } from './admin-job.controller';
import { ApplicationEventsConsumer } from './application-events.consumer';
import { CompanySnapshotEventsConsumer } from './company-snapshot-events.consumer';
import { CompanySnapshotService } from './company-snapshot.service';
import { JobModerationReview } from './entities/job-moderation-review.entity';
import { JobRevision } from './entities/job-revision.entity';
import { Job } from './entities/job.entity';
import { JobController } from './job.controller';
import { JobModerationService } from './job-moderation.service';
import { JobService } from './job.service';
import { RecruiterJobController } from './recruiter-job.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Job, JobRevision, JobModerationReview])],
  controllers: [JobController, RecruiterJobController, AdminJobController],
  providers: [
    JobService,
    JobModerationService,
    CompanySnapshotService,
    ApplicationEventsConsumer,
    CompanySnapshotEventsConsumer,
  ],
  exports: [JobService],
})
export class JobModule {}
