export interface ParsedResumeProfile {
  fullName?: string;
  phone?: string;
  contactEmail?: string;
  headline?: string;
  summary?: string;
  location?: string;
  portfolioUrl?: string;
  linkedinUrl?: string;
}

export interface ParsedResumeSkill {
  name: string;
  level?: string;
  yearsOfExperience?: number;
}

export interface ParsedResumeExperience {
  companyName: string;
  position: string;
  employmentType?: string;
  startMonth?: number;
  startYear?: number;
  endMonth?: number;
  endYear?: number;
  isCurrent?: boolean;
  description?: string;
}

export interface ParsedResumeEducation {
  schoolName: string;
  degree?: string;
  fieldOfStudy?: string;
  startYear?: number;
  endYear?: number;
  isCurrent?: boolean;
  description?: string;
}

export interface ParsedResumeCertification {
  name: string;
  issuer?: string;
  credentialUrl?: string;
  issuedYear?: number;
  description?: string;
}

export interface ParsedResumeProject {
  name: string;
  description?: string;
  technologies?: string[];
  projectUrl?: string;
}

export interface ParsedResume {
  profile: ParsedResumeProfile;
  skills: ParsedResumeSkill[];
  experiences: ParsedResumeExperience[];
  educations: ParsedResumeEducation[];
  certifications: ParsedResumeCertification[];
  projects: ParsedResumeProject[];
}
