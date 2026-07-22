export enum CandidateProfileVisibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
}

export enum CandidateDataSource {
  MANUAL = 'MANUAL',
  CV_PARSE = 'CV_PARSE',
  IMPORT = 'IMPORT',
}

export enum CandidateSkillLevel {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED',
  EXPERT = 'EXPERT',
}

export enum CandidateEmploymentType {
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
  CONTRACT = 'CONTRACT',
  INTERNSHIP = 'INTERNSHIP',
  FREELANCE = 'FREELANCE',
}

export enum CandidateCvParseStatus {
  NOT_PARSED = 'NOT_PARSED',
  PARSING = 'PARSING',
  PARSED = 'PARSED',
  FAILED = 'FAILED',
}

export enum CandidateCvSource {
  UPLOADED = 'UPLOADED',
  TEMPLATE_EXPORT = 'TEMPLATE_EXPORT',
}

export enum CvTemplateKey {
  MODERN = 'modern',
  CLASSIC = 'classic',
  MINIMAL = 'minimal',
}

export enum CvTemplateSectionKey {
  PROFILE = 'profile',
  SUMMARY = 'summary',
  SKILLS = 'skills',
  EXPERIENCES = 'experiences',
  EDUCATIONS = 'educations',
  PROJECTS = 'projects',
  CERTIFICATIONS = 'certifications',
  LANGUAGES = 'languages',
  AWARDS = 'awards',
  REFERENCES = 'references',
}

export enum CvTemplateCreateSource {
  EMPTY = 'EMPTY',
  DEFAULT = 'DEFAULT',
}
