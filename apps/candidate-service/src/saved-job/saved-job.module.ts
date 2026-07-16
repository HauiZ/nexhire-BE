import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandidateProfile } from '../candidate/entities/candidate-profile.entity';
import { SavedJob } from './entities/saved-job.entity';
import { JobSnapshotClient } from './job-snapshot.client';
import { SavedJobController } from './saved-job.controller';
import { SavedJobService } from './saved-job.service';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([CandidateProfile, SavedJob])],
  controllers: [SavedJobController],
  providers: [SavedJobService, JobSnapshotClient],
  exports: [SavedJobService],
})
export class SavedJobModule {}
