import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandidateController } from './candidate.controller';
import { CandidateService } from './candidate.service';
import { CandidateEducation } from './entities/candidate-education.entity';
import { CandidateExperience } from './entities/candidate-experience.entity';
import { CandidateProfile } from './entities/candidate-profile.entity';
import { CandidateSkill } from './entities/candidate-skill.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CandidateProfile,
      CandidateSkill,
      CandidateEducation,
      CandidateExperience,
    ]),
  ],
  controllers: [CandidateController],
  providers: [CandidateService],
  exports: [CandidateService],
})
export class CandidateModule {}
