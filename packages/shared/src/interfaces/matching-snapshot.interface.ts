export interface CandidateMatchingSkill {
  id?: string | null;
  name: string;
  level: string | null;
  yearsOfExperience: number | null;
}

export interface CandidateMatchingExperience {
  id?: string | null;
  title: string | null;
  company: string | null;
  description: string | null;
  startYear: number | null;
  startMonth: number | null;
  endYear: number | null;
  endMonth: number | null;
  isCurrent: boolean | null;
}

export interface CandidateMatchingEducation {
  id?: string | null;
  degree: string | null;
  school: string | null;
  fieldOfStudy: string | null;
  description: string | null;
}

export interface CandidateMatchingCertification {
  id?: string | null;
  name: string;
  issuer: string | null;
  description: string | null;
  issuedYear: number | null;
}

export interface CandidateMatchingProject {
  id?: string | null;
  name: string | null;
  description: string | null;
  technologies: string[];
}

export interface CandidateMatchingSnapshot {
  snapshotSchemaVersion: 'candidate-matching-v2';
  dataOrigin: 'PROFILE' | 'PARSED_CV';
  candidateId: string;
  candidateUserId: string | null;
  candidateCvId: string | null;
  fullName: string | null;
  headline: string | null;
  summary: string | null;
  location: string | null;
  skills: CandidateMatchingSkill[];
  experiences: CandidateMatchingExperience[];
  educations: CandidateMatchingEducation[];
  certifications: CandidateMatchingCertification[];
  projects: CandidateMatchingProject[];
}
