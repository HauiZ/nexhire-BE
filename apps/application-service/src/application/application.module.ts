import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationInternalClientService } from './application-internal-client.service';
import { ApplicationController, ApplicationInternalController } from './application.controller';
import { ApplicationService } from './application.service';
import { Application } from './entities/application.entity';
import { ApplicationProgressEvent } from './entities/application-progress-event.entity';
import { JobLifecycleEventsConsumer } from './events/consumers/job-lifecycle-events.consumer';
import { MatchingCompletedEventsConsumer } from './events/consumers/matching-completed-events.consumer';
import { ApplicationEventPublisher } from './events/application-event.publisher';
import { CvParsedEventsConsumer } from './events/consumers/cv-parsed-events.consumer';
import { RecruiterApplicationController } from './recruiter-application.controller';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([Application, ApplicationProgressEvent])],
  controllers: [
    ApplicationController,
    ApplicationInternalController,
    RecruiterApplicationController,
  ],
  providers: [
    ApplicationService,
    ApplicationInternalClientService,
    ApplicationEventPublisher,
    CvParsedEventsConsumer,
    JobLifecycleEventsConsumer,
    MatchingCompletedEventsConsumer,
  ],
  exports: [ApplicationService],
})
export class ApplicationModule {}
