import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationInternalClientService } from './application-internal-client.service';
import { ApplicationController } from './application.controller';
import { ApplicationService } from './application.service';
import { Application } from './entities/application.entity';
import { JobLifecycleEventsConsumer } from './events/consumers/job-lifecycle-events.consumer';
import { ApplicationEventPublisher } from './events/application-event.publisher';
import { RecruiterApplicationController } from './recruiter-application.controller';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([Application])],
  controllers: [ApplicationController, RecruiterApplicationController],
  providers: [
    ApplicationService,
    ApplicationInternalClientService,
    ApplicationEventPublisher,
    JobLifecycleEventsConsumer,
  ],
  exports: [ApplicationService],
})
export class ApplicationModule {}
