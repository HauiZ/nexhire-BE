import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationInternalClientService } from './application-internal-client.service';
import { ApplicationController } from './application.controller';
import { ApplicationService } from './application.service';
import { JobLifecycleEventsConsumer } from './consumers/job-lifecycle-events.consumer';
import { Application } from './entities/application.entity';
import { RecruiterApplicationController } from './recruiter-application.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Application])],
  controllers: [ApplicationController, RecruiterApplicationController],
  providers: [ApplicationService, ApplicationInternalClientService, JobLifecycleEventsConsumer],
  exports: [ApplicationService],
})
export class ApplicationModule {}
