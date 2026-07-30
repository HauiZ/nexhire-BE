import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentClientModule } from '../document-client/document-client.module';
import { AuthClientService } from './auth-client.service';
import { CandidateController } from './candidate.controller';
import { CandidateInternalController } from './candidate-internal.controller';
import { CandidateService } from './candidate.service';
import { CandidateCertification } from './entities/candidate-certification.entity';
import { CandidateCv } from './entities/candidate-cv.entity';
import { CandidateEducation } from './entities/candidate-education.entity';
import { CandidateExperience } from './entities/candidate-experience.entity';
import { CandidateProfile } from './entities/candidate-profile.entity';
import { CandidateProject } from './entities/candidate-project.entity';
import { CandidateSkill } from './entities/candidate-skill.entity';
import { CvParseEventsConsumer } from './events/consumers/cv-parse-events.consumer';
import { CandidateEventPublisher } from './events/candidate-event.publisher';

@Module({
  imports: [
    HttpModule,
    DocumentClientModule,
    TypeOrmModule.forFeature([
      CandidateProfile,
      CandidateSkill,
      CandidateEducation,
      CandidateExperience,
      CandidateCertification,
      CandidateProject,
      CandidateCv,
    ]),
  ],
  controllers: [CandidateController, CandidateInternalController],
  providers: [CandidateService, AuthClientService, CandidateEventPublisher, CvParseEventsConsumer],
  exports: [CandidateService],
})
export class CandidateModule {}
