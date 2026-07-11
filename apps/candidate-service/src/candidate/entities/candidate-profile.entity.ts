import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { CandidateEducation } from './candidate-education.entity';
import { CandidateExperience } from './candidate-experience.entity';
import { CandidateProfileVisibility } from './candidate.enum';
import { CandidateSkill } from './candidate-skill.entity';

@Entity('candidate_profiles')
@Index('uq_candidate_profiles_user_id', ['userId'], { unique: true })
export class CandidateProfile {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_candidate_profiles_id',
  })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'full_name', type: 'varchar', length: 255, nullable: true })
  fullName: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ name: 'contact_email', type: 'varchar', length: 255, nullable: true })
  contactEmail: string | null;

  @Column({ name: 'avatar_document_id', type: 'uuid', nullable: true })
  avatarDocumentId: string | null;

  @Column({ name: 'headline', type: 'varchar', length: 255, nullable: true })
  headline: string | null;

  @Column({ name: 'summary', type: 'text', nullable: true })
  summary: string | null;

  @Column({ name: 'location', type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({ name: 'portfolio_url', type: 'text', nullable: true })
  portfolioUrl: string | null;

  @Column({ name: 'linkedin_url', type: 'text', nullable: true })
  linkedinUrl: string | null;

  @Column({ name: 'open_to_work', type: 'boolean', default: true })
  openToWork: boolean;

  @Column({
    name: 'visibility',
    type: 'enum',
    enum: CandidateProfileVisibility,
    enumName: 'candidate_profile_visibility_enum',
    default: CandidateProfileVisibility.PUBLIC,
  })
  visibility: CandidateProfileVisibility;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => CandidateSkill, (skill) => skill.candidate)
  skills: CandidateSkill[];

  @OneToMany(() => CandidateEducation, (education) => education.candidate)
  educations: CandidateEducation[];

  @OneToMany(() => CandidateExperience, (experience) => experience.candidate)
  experiences: CandidateExperience[];
}
