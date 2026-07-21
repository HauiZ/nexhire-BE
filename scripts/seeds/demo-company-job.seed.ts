import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import {
  ApplicationStage,
  CompanyStatus,
  CompanyTrustLevel as SharedCompanyTrustLevel,
  JobExperienceLevel,
  JobModerationDecision,
  JobModerationRiskLevel,
  JobReviewDecision,
  JobStatus,
  JobType,
  JobWorkingType,
  UserRole,
} from '@nexhire/shared';
import authDataSource from '../../apps/auth-service/data-source';
import { RecruiterCompanyLink } from '../../apps/auth-service/src/auth/entities/recruiter-company-link.entity';
import { Role } from '../../apps/auth-service/src/auth/entities/role.entity';
import { UserStatus, PasswordAlgorithm } from '../../apps/auth-service/src/auth/entities/auth.enum';
import { User } from '../../apps/auth-service/src/auth/entities/user.entity';
import { UserCredential } from '../../apps/auth-service/src/auth/entities/user-credential.entity';
import { UserRoleEntity } from '../../apps/auth-service/src/auth/entities/user-role.entity';
import { seedAuthRoles } from '../../apps/auth-service/src/seeds/auth-role.seed';
import companyDataSource from '../../apps/company-service/data-source';
import { Company } from '../../apps/company-service/src/company/entities/company.entity';
import {
  CompanyVerificationDocument,
  CompanyVerificationDocumentType,
} from '../../apps/company-service/src/company/entities/company-verification-document.entity';
import candidateDataSource from '../../apps/candidate-service/data-source';
import { CandidateCv } from '../../apps/candidate-service/src/candidate/entities/candidate-cv.entity';
import { CandidateProfile } from '../../apps/candidate-service/src/candidate/entities/candidate-profile.entity';
import {
  CandidateCvParseStatus,
  CandidateProfileVisibility,
} from '../../apps/candidate-service/src/candidate/entities/candidate.enum';
import applicationDataSource from '../../apps/application-service/data-source';
import {
  Application,
  ApplicationMatchLevel,
} from '../../apps/application-service/src/application/entities/application.entity';
import documentStorageDataSource from '../../apps/document-storage-service/data-source';
import { Document } from '../../apps/document-storage-service/src/document/entities/document.entity';
import {
  DocumentOwnerType,
  DocumentType,
} from '../../apps/document-storage-service/src/document/entities/document.enum';
import jobDataSource from '../../apps/job-service/data-source';
import { JobModerationReview } from '../../apps/job-service/src/job/entities/job-moderation-review.entity';
import {
  CompanyStatusSnapshot,
  CompanyTrustLevel,
  JobModerationTargetType,
} from '../../apps/job-service/src/job/entities/job.enum';
import { Job } from '../../apps/job-service/src/job/entities/job.entity';
import { JobSearchTextService } from '../../apps/job-service/src/job/search/job-search-text.service';

const DEMO_PASSWORD = 'Password@123';
const DEMO_BCRYPT_ROUNDS = 12;
const ADMIN_REVIEWER_ID = '00000000-0000-4000-8000-000000000001';

const CATEGORY_IDS = {
  engineering: '11111111-1111-4111-8111-111111111111',
  design: '22222222-2222-4222-8222-222222222222',
  data: '33333333-3333-4333-8333-333333333333',
  marketing: '44444444-4444-4444-8444-444444444444',
  customerSuccess: '55555555-5555-4555-8555-555555555555',
  business: '66666666-6666-4666-8666-666666666666',
};

type DemoCompany = {
  id: string;
  ownerId: string;
  recruiterEmail: string;
  recruiterName: string;
  name: string;
  logo: string;
  taxCode: string;
  website: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  description: string;
  industry: string;
  size: string;
  foundedYear: number;
  mission: string;
  culture: string;
  values: string[];
  perks: string[];
  heroImageUrl: string;
  trustLevel: SharedCompanyTrustLevel;
  approvedLowRiskCount: number;
  negativeTrustSignalCount?: number;
  status?: CompanyStatus;
  statusReason?: string | null;
};

type DemoJob = {
  id: string;
  companyId: string;
  title: string;
  description: string;
  requirements: string;
  skills: string[];
  benefits: string;
  categoryId: string;
  employmentType: JobType;
  workingType: JobWorkingType;
  experienceLevel: JobExperienceLevel;
  location: string;
  salaryMin: number;
  salaryMax: number;
  numberOfOpenings: number;
  publishedDaysAgo: number;
};

type DemoDocument = {
  id: string;
  documentType: DocumentType;
  ownerType: DocumentOwnerType;
  ownerId: string;
  fileName: string;
  mimeType: string;
  size: number;
  key: string;
};

type DemoCandidate = {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  phone: string;
  headline: string;
  summary: string;
  location: string;
  avatarDocumentId: string;
  cvId: string;
  cvDocumentId: string;
  cvTitle: string;
  cvFileName: string;
  cvMimeType: string;
  cvSize: number;
};

type DemoApplication = {
  id: string;
  candidateId: string;
  jobId: string;
  status: ApplicationStage;
  coverLetter: string;
  matchScore: number;
  matchLevel: ApplicationMatchLevel;
  submittedDaysAgo: number;
  statusNote?: string | null;
};

const demoCompanies: DemoCompany[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    ownerId: '20000000-0000-4000-8000-000000000001',
    recruiterEmail: 'recruiter.nexhire.tech@nexhire.demo',
    recruiterName: 'NexHire Tech Recruiter',
    name: 'NexHire Tech',
    logo: 'https://cdn.nexhire.vn/demo/companies/nexhire-tech.png',
    taxCode: 'DEMO-NEXHIRE-001',
    website: 'https://nexhire.vn',
    contactEmail: 'hr@nexhire.vn',
    contactPhone: '02473001001',
    address: 'Cau Giay, Ha Noi',
    description: 'Product engineering company building recruitment and HR automation platforms.',
    industry: 'HR Tech',
    size: '100-500',
    foundedYear: 2018,
    mission: 'Build reliable recruitment automation for modern hiring teams.',
    culture:
      'Product squads work with clear goals, practical engineering standards, and direct customer feedback.',
    values: ['Clear ownership', 'Candidate empathy', 'Continuous improvement'],
    perks: ['Hybrid work', 'Learning budget', 'Transparent performance review'],
    heroImageUrl: 'https://cdn.nexhire.vn/demo/companies/nexhire-tech-hero.png',
    trustLevel: SharedCompanyTrustLevel.HIGH,
    approvedLowRiskCount: 8,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    ownerId: '20000000-0000-4000-8000-000000000002',
    recruiterEmail: 'recruiter.cloudify@nexhire.demo',
    recruiterName: 'Cloudify Recruiter',
    name: 'Cloudify VN',
    logo: 'https://cdn.nexhire.vn/demo/companies/cloudify-vn.png',
    taxCode: 'DEMO-CLOUDIFY-002',
    website: 'https://cloudify.example',
    contactEmail: 'talent@cloudify.example',
    contactPhone: '02873001002',
    address: 'District 1, Ho Chi Minh City',
    description:
      'Cloud consulting and platform team delivering scalable systems for regional clients.',
    industry: 'Cloud Infrastructure',
    size: '51-200',
    foundedYear: 2020,
    mission: 'Help teams ship resilient cloud platforms without unnecessary operational drag.',
    culture: 'Engineers pair on architecture decisions and keep delivery rituals lightweight.',
    values: ['Reliability', 'Practical automation', 'Knowledge sharing'],
    perks: ['Cloud certification budget', 'Remote-friendly work', 'Quarterly team retreats'],
    heroImageUrl: 'https://cdn.nexhire.vn/demo/companies/cloudify-vn-hero.png',
    trustLevel: SharedCompanyTrustLevel.HIGH,
    approvedLowRiskCount: 6,
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    ownerId: '20000000-0000-4000-8000-000000000003',
    recruiterEmail: 'recruiter.brightlabs@nexhire.demo',
    recruiterName: 'BrightLabs Recruiter',
    name: 'BrightLabs',
    logo: 'https://cdn.nexhire.vn/demo/companies/brightlabs.png',
    taxCode: 'DEMO-BRIGHTLABS-003',
    website: 'https://brightlabs.example',
    contactEmail: 'careers@brightlabs.example',
    contactPhone: '023673001003',
    address: 'Hai Chau, Da Nang',
    description:
      'Growth and marketing studio helping SaaS teams improve acquisition and retention.',
    industry: 'Growth Marketing',
    size: '11-50',
    foundedYear: 2019,
    mission: 'Turn product signals into sustainable growth experiments for SaaS teams.',
    culture:
      'Small client pods move quickly, share experiment learnings, and measure outcomes weekly.',
    values: ['Experimentation', 'Ownership', 'Customer insight'],
    perks: ['Flexible schedule', 'Campaign tooling budget', 'Monthly learning sessions'],
    heroImageUrl: 'https://cdn.nexhire.vn/demo/companies/brightlabs-hero.png',
    trustLevel: SharedCompanyTrustLevel.MEDIUM,
    approvedLowRiskCount: 4,
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    ownerId: '20000000-0000-4000-8000-000000000004',
    recruiterEmail: 'recruiter.apexforge@nexhire.demo',
    recruiterName: 'ApexForge Recruiter',
    name: 'ApexForge',
    logo: 'https://cdn.nexhire.vn/demo/companies/apexforge.png',
    taxCode: 'DEMO-APEXFORGE-004',
    website: 'https://apexforge.example',
    contactEmail: 'jobs@apexforge.example',
    contactPhone: '02473001004',
    address: 'Thanh Xuan, Ha Noi',
    description: 'Mobile-first product studio focused on fintech and marketplace applications.',
    industry: 'Mobile Product',
    size: '51-200',
    foundedYear: 2021,
    mission: 'Create mobile products that feel fast, secure, and easy to trust.',
    culture: 'Cross-functional teams validate product decisions with real users before scaling.',
    values: ['Craft', 'Security mindset', 'Fast feedback'],
    perks: ['Device allowance', 'Product training', 'Hybrid work'],
    heroImageUrl: 'https://cdn.nexhire.vn/demo/companies/apexforge-hero.png',
    trustLevel: SharedCompanyTrustLevel.MEDIUM,
    approvedLowRiskCount: 3,
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    ownerId: '20000000-0000-4000-8000-000000000005',
    recruiterEmail: 'recruiter.lumastudio@nexhire.demo',
    recruiterName: 'Luma Studio Recruiter',
    name: 'Luma Studio',
    logo: 'https://cdn.nexhire.vn/demo/companies/luma-studio.png',
    taxCode: 'DEMO-LUMA-005',
    website: 'https://lumastudio.example',
    contactEmail: 'hello@lumastudio.example',
    contactPhone: '02873001005',
    address: 'Thu Duc, Ho Chi Minh City',
    description: 'Design studio creating product experiences for consumer and business software.',
    industry: 'Product Design',
    size: '11-50',
    foundedYear: 2017,
    mission: 'Design useful digital products with research, clarity, and a strong visual system.',
    culture:
      'Designers and engineers critique work openly and keep product decisions evidence-led.',
    values: ['User research', 'Visual clarity', 'Collaboration'],
    perks: ['Design conference budget', 'Flexible hours', 'Studio equipment support'],
    heroImageUrl: 'https://cdn.nexhire.vn/demo/companies/luma-studio-hero.png',
    trustLevel: SharedCompanyTrustLevel.MEDIUM,
    approvedLowRiskCount: 2,
  },
  {
    id: '10000000-0000-4000-8000-000000000006',
    ownerId: '20000000-0000-4000-8000-000000000006',
    recruiterEmail: 'recruiter.northstar@nexhire.demo',
    recruiterName: 'North Star Recruiter',
    name: 'North Star',
    logo: 'https://cdn.nexhire.vn/demo/companies/north-star.png',
    taxCode: 'DEMO-NORTHSTAR-006',
    website: 'https://northstar.example',
    contactEmail: 'people@northstar.example',
    contactPhone: '02473001006',
    address: 'Ba Dinh, Ha Noi',
    description: 'Data and revenue operations team supporting B2B companies across APAC.',
    industry: 'Revenue Operations',
    size: '51-200',
    foundedYear: 2016,
    mission: 'Make B2B revenue teams more predictable with clean data and operating rhythm.',
    culture:
      'Analysts work close to sales and success teams, with calm planning and clear ownership.',
    values: ['Data quality', 'Business clarity', 'Long-term partnership'],
    perks: ['Analytics tooling budget', 'Mentorship program', 'Annual company trip'],
    heroImageUrl: 'https://cdn.nexhire.vn/demo/companies/north-star-hero.png',
    trustLevel: SharedCompanyTrustLevel.MEDIUM,
    approvedLowRiskCount: 3,
  },
];

const demoReviewCompanies: DemoCompany[] = [
  {
    id: '10000000-0000-4000-8000-000000000101',
    ownerId: '20000000-0000-4000-8000-000000000101',
    recruiterEmail: 'recruiter.pending@nexhire.demo',
    recruiterName: 'Pending Company Recruiter',
    name: 'GreenField AI',
    logo: 'https://cdn.nexhire.vn/demo/companies/greenfield-ai.png',
    taxCode: 'DEMO-GREENFIELD-101',
    website: 'https://greenfield.example',
    contactEmail: 'verify@greenfield.example',
    contactPhone: '02473001101',
    address: 'Nam Tu Liem, Ha Noi',
    description: 'AI workflow startup submitting company verification documents for review.',
    industry: 'AI Productivity',
    size: '11-50',
    foundedYear: 2024,
    mission: 'Automate repetitive office work while keeping teams in control.',
    culture: 'Small product team, fast validation cycles, and careful customer onboarding.',
    values: ['Responsible AI', 'Customer clarity', 'Fast learning'],
    perks: ['Flexible hours', 'Founder office hours', 'AI tooling budget'],
    heroImageUrl: 'https://cdn.nexhire.vn/demo/companies/greenfield-ai-hero.png',
    trustLevel: SharedCompanyTrustLevel.LOW,
    approvedLowRiskCount: 0,
    negativeTrustSignalCount: 0,
    status: CompanyStatus.PENDING,
    statusReason: 'Demo seed: waiting for admin verification',
  },
  {
    id: '10000000-0000-4000-8000-000000000102',
    ownerId: '20000000-0000-4000-8000-000000000102',
    recruiterEmail: 'recruiter.rejected@nexhire.demo',
    recruiterName: 'Rejected Company Recruiter',
    name: 'Unverified Labs',
    logo: 'https://cdn.nexhire.vn/demo/companies/unverified-labs.png',
    taxCode: 'DEMO-UNVERIFIED-102',
    website: 'https://unverified.example',
    contactEmail: 'contact@unverified.example',
    contactPhone: '02873001102',
    address: 'Unknown District, Ho Chi Minh City',
    description: 'Company profile rejected in demo data because verification proof was incomplete.',
    industry: 'Software Services',
    size: '1-10',
    foundedYear: 2025,
    mission: 'Demo company for rejected verification state.',
    culture: 'Incomplete verification profile.',
    values: ['Needs review'],
    perks: ['Not visible to candidates'],
    heroImageUrl: 'https://cdn.nexhire.vn/demo/companies/unverified-labs-hero.png',
    trustLevel: SharedCompanyTrustLevel.LOW,
    approvedLowRiskCount: 0,
    negativeTrustSignalCount: 1,
    status: CompanyStatus.REJECTED,
    statusReason: 'Demo seed: tax document does not match registered business name',
  },
  {
    id: '10000000-0000-4000-8000-000000000103',
    ownerId: '20000000-0000-4000-8000-000000000103',
    recruiterEmail: 'recruiter.suspended@nexhire.demo',
    recruiterName: 'Suspended Company Recruiter',
    name: 'Paused Hiring Co',
    logo: 'https://cdn.nexhire.vn/demo/companies/paused-hiring.png',
    taxCode: 'DEMO-PAUSED-103',
    website: 'https://paused.example',
    contactEmail: 'hr@paused.example',
    contactPhone: '02473001103',
    address: 'Hai Ba Trung, Ha Noi',
    description: 'Company profile suspended in demo data for admin lifecycle checks.',
    industry: 'Operations Software',
    size: '51-200',
    foundedYear: 2022,
    mission: 'Demo company for suspended lifecycle state.',
    culture: 'Temporarily paused by admin.',
    values: ['Operational discipline'],
    perks: ['Not visible to candidates'],
    heroImageUrl: 'https://cdn.nexhire.vn/demo/companies/paused-hiring-hero.png',
    trustLevel: SharedCompanyTrustLevel.LOW,
    approvedLowRiskCount: 1,
    negativeTrustSignalCount: 2,
    status: CompanyStatus.SUSPENDED,
    statusReason: 'Demo seed: suspended for policy review',
  },
];

const allDemoCompanies = [...demoCompanies, ...demoReviewCompanies];

const demoJobs: DemoJob[] = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    companyId: demoCompanies[0].id,
    title: 'Senior Frontend Engineer',
    description:
      'Build polished candidate-facing web experiences with React, TypeScript, and a modern design system.',
    requirements:
      'Strong React experience, TypeScript fluency, accessibility awareness, and API integration skills.',
    skills: ['React', 'TypeScript', 'REST API'],
    benefits: 'Hybrid work, annual bonus, learning budget, and premium healthcare.',
    categoryId: CATEGORY_IDS.engineering,
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.HYBRID,
    experienceLevel: JobExperienceLevel.SENIOR,
    location: 'Ha Noi, Viet Nam',
    salaryMin: 35000000,
    salaryMax: 55000000,
    numberOfOpenings: 2,
    publishedDaysAgo: 1,
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    companyId: demoCompanies[1].id,
    title: 'Backend Engineer',
    description:
      'Design and maintain NestJS services, PostgreSQL schemas, and asynchronous workflows for cloud products.',
    requirements:
      'Experience with Node.js, PostgreSQL, message queues, testing, and production observability.',
    skills: ['NestJS', 'PostgreSQL', 'RabbitMQ'],
    benefits: 'Remote-friendly setup, stock option plan, and certification support.',
    categoryId: CATEGORY_IDS.engineering,
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.REMOTE,
    experienceLevel: JobExperienceLevel.MIDDLE,
    location: 'Remote, Viet Nam',
    salaryMin: 30000000,
    salaryMax: 48000000,
    numberOfOpenings: 3,
    publishedDaysAgo: 2,
  },
  {
    id: '30000000-0000-4000-8000-000000000003',
    companyId: demoCompanies[3].id,
    title: 'Lead Mobile Engineer',
    description:
      'Lead a React Native squad building reliable fintech mobile features for thousands of daily users.',
    requirements:
      'Solid mobile architecture experience, React Native expertise, code review habits, and mentoring skills.',
    skills: ['React Native', 'Mobile', 'Fintech'],
    benefits: 'Flexible hours, device allowance, and leadership training.',
    categoryId: CATEGORY_IDS.engineering,
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.HYBRID,
    experienceLevel: JobExperienceLevel.LEAD,
    location: 'Ho Chi Minh City, Viet Nam',
    salaryMin: 45000000,
    salaryMax: 70000000,
    numberOfOpenings: 1,
    publishedDaysAgo: 3,
  },
  {
    id: '30000000-0000-4000-8000-000000000004',
    companyId: demoCompanies[2].id,
    title: 'Marketing Operations Specialist',
    description:
      'Operate campaign systems, automation workflows, and reporting dashboards for SaaS growth programs.',
    requirements:
      'Hands-on CRM, marketing automation, analytics, and cross-functional coordination experience.',
    skills: ['CRM', 'Automation', 'Growth'],
    benefits: 'Quarterly performance bonus, hybrid work, and paid training.',
    categoryId: CATEGORY_IDS.marketing,
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.HYBRID,
    experienceLevel: JobExperienceLevel.JUNIOR,
    location: 'Da Nang, Viet Nam',
    salaryMin: 18000000,
    salaryMax: 28000000,
    numberOfOpenings: 2,
    publishedDaysAgo: 4,
  },
  {
    id: '30000000-0000-4000-8000-000000000005',
    companyId: demoCompanies[5].id,
    title: 'Growth Marketing Manager',
    description:
      'Own acquisition experiments, lifecycle campaigns, and growth analytics for B2B software products.',
    requirements:
      'Proven growth experimentation, paid channel management, funnel analysis, and stakeholder communication.',
    skills: ['B2B', 'SaaS', 'Growth'],
    benefits: 'Performance bonus, flexible leave, and conference budget.',
    categoryId: CATEGORY_IDS.marketing,
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.HYBRID,
    experienceLevel: JobExperienceLevel.SENIOR,
    location: 'Ha Noi, Viet Nam',
    salaryMin: 35000000,
    salaryMax: 60000000,
    numberOfOpenings: 1,
    publishedDaysAgo: 5,
  },
  {
    id: '30000000-0000-4000-8000-000000000006',
    companyId: demoCompanies[4].id,
    title: 'Product Designer',
    description:
      'Create end-to-end product flows, prototypes, and UI systems for customer-facing SaaS products.',
    requirements:
      'Portfolio showing UX thinking, Figma craft, usability testing, and collaboration with engineers.',
    skills: ['Product Design', 'UX', 'Research'],
    benefits: 'Design conference budget, hybrid studio days, and wellness allowance.',
    categoryId: CATEGORY_IDS.design,
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.HYBRID,
    experienceLevel: JobExperienceLevel.MIDDLE,
    location: 'Ho Chi Minh City, Viet Nam',
    salaryMin: 28000000,
    salaryMax: 45000000,
    numberOfOpenings: 1,
    publishedDaysAgo: 6,
  },
  {
    id: '30000000-0000-4000-8000-000000000007',
    companyId: demoCompanies[0].id,
    title: 'UI Engineer',
    description:
      'Turn complex dashboard requirements into maintainable interface components and responsive layouts.',
    requirements:
      'Strong CSS, component architecture, frontend testing, and attention to interaction details.',
    skills: ['React', 'CSS', 'Design System'],
    benefits: 'Hybrid work, mentorship, and modern equipment.',
    categoryId: CATEGORY_IDS.design,
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.HYBRID,
    experienceLevel: JobExperienceLevel.JUNIOR,
    location: 'Ha Noi, Viet Nam',
    salaryMin: 22000000,
    salaryMax: 36000000,
    numberOfOpenings: 2,
    publishedDaysAgo: 7,
  },
  {
    id: '30000000-0000-4000-8000-000000000008',
    companyId: demoCompanies[5].id,
    title: 'Data Analyst',
    description:
      'Build reporting models, analyze product funnels, and turn business questions into clear insights.',
    requirements:
      'SQL proficiency, dashboarding experience, data storytelling, and careful metric definitions.',
    skills: ['SQL', 'Dashboard', 'Analytics'],
    benefits: 'Remote days, analytics tool budget, and quarterly team offsites.',
    categoryId: CATEGORY_IDS.data,
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.HYBRID,
    experienceLevel: JobExperienceLevel.JUNIOR,
    location: 'Ha Noi, Viet Nam',
    salaryMin: 20000000,
    salaryMax: 32000000,
    numberOfOpenings: 2,
    publishedDaysAgo: 8,
  },
  {
    id: '30000000-0000-4000-8000-000000000009',
    companyId: demoCompanies[1].id,
    title: 'Data Engineer',
    description:
      'Develop batch and streaming pipelines that power analytics, reporting, and product recommendations.',
    requirements:
      'Experience with SQL, Python, ETL design, data quality checks, and cloud data platforms.',
    skills: ['Python', 'ETL', 'BigQuery'],
    benefits: 'Certification budget, remote work, and performance bonus.',
    categoryId: CATEGORY_IDS.data,
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.REMOTE,
    experienceLevel: JobExperienceLevel.MIDDLE,
    location: 'Remote, Viet Nam',
    salaryMin: 32000000,
    salaryMax: 52000000,
    numberOfOpenings: 2,
    publishedDaysAgo: 9,
  },
  {
    id: '30000000-0000-4000-8000-000000000010',
    companyId: demoCompanies[0].id,
    title: 'Customer Success Manager',
    description:
      'Guide enterprise customers through onboarding, adoption planning, and long-term value realization.',
    requirements:
      'B2B customer success experience, excellent communication, onboarding planning, and CRM discipline.',
    skills: ['B2B', 'Onboarding', 'CS'],
    benefits: 'Hybrid work, customer success certification, and annual bonus.',
    categoryId: CATEGORY_IDS.customerSuccess,
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.HYBRID,
    experienceLevel: JobExperienceLevel.MIDDLE,
    location: 'Ha Noi, Viet Nam',
    salaryMin: 25000000,
    salaryMax: 40000000,
    numberOfOpenings: 1,
    publishedDaysAgo: 10,
  },
  {
    id: '30000000-0000-4000-8000-000000000011',
    companyId: demoCompanies[1].id,
    title: 'Technical Support Engineer',
    description:
      'Resolve product issues, collaborate with engineering, and improve support documentation for cloud users.',
    requirements:
      'Troubleshooting mindset, SQL basics, API understanding, and clear written communication.',
    skills: ['Support', 'SQL', 'API'],
    benefits: 'Remote-friendly work, support training, and shift allowance.',
    categoryId: CATEGORY_IDS.customerSuccess,
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.REMOTE,
    experienceLevel: JobExperienceLevel.FRESHER,
    location: 'Remote, Viet Nam',
    salaryMin: 16000000,
    salaryMax: 26000000,
    numberOfOpenings: 3,
    publishedDaysAgo: 11,
  },
  {
    id: '30000000-0000-4000-8000-000000000012',
    companyId: demoCompanies[4].id,
    title: 'Business Analyst',
    description:
      'Clarify product requirements, map workflows, and support delivery teams from discovery to release.',
    requirements:
      'Good documentation, stakeholder interviews, user story writing, and basic data analysis.',
    skills: ['Product', 'Analysis', 'Client'],
    benefits: 'Hybrid work, product training, and annual company trip.',
    categoryId: CATEGORY_IDS.business,
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.HYBRID,
    experienceLevel: JobExperienceLevel.JUNIOR,
    location: 'Ho Chi Minh City, Viet Nam',
    salaryMin: 18000000,
    salaryMax: 30000000,
    numberOfOpenings: 2,
    publishedDaysAgo: 12,
  },
  {
    id: '30000000-0000-4000-8000-000000000013',
    companyId: demoCompanies[3].id,
    title: 'Product Manager',
    description:
      'Own product discovery, roadmap shaping, and delivery coordination for marketplace features.',
    requirements:
      'Product discovery experience, prioritization skill, analytics fluency, and strong facilitation.',
    skills: ['Product', 'Roadmap', 'Analytics'],
    benefits: 'Leadership coaching, flexible leave, and performance bonus.',
    categoryId: CATEGORY_IDS.business,
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.HYBRID,
    experienceLevel: JobExperienceLevel.SENIOR,
    location: 'Ho Chi Minh City, Viet Nam',
    salaryMin: 42000000,
    salaryMax: 68000000,
    numberOfOpenings: 1,
    publishedDaysAgo: 13,
  },
  {
    id: '30000000-0000-4000-8000-000000000014',
    companyId: demoCompanies[2].id,
    title: 'Content Marketing Intern',
    description:
      'Support SEO articles, social content, and campaign landing pages for technology clients.',
    requirements:
      'Good writing, basic SEO knowledge, curiosity about SaaS, and willingness to learn.',
    skills: ['SEO', 'Content', 'Social'],
    benefits: 'Mentorship, flexible schedule, and internship allowance.',
    categoryId: CATEGORY_IDS.marketing,
    employmentType: JobType.INTERNSHIP,
    workingType: JobWorkingType.HYBRID,
    experienceLevel: JobExperienceLevel.INTERN,
    location: 'Da Nang, Viet Nam',
    salaryMin: 5000000,
    salaryMax: 8000000,
    numberOfOpenings: 2,
    publishedDaysAgo: 14,
  },
  {
    id: '30000000-0000-4000-8000-000000000015',
    companyId: demoCompanies[0].id,
    title: 'Junior QA Engineer',
    description:
      'Test web features, write regression cases, and collaborate with engineers to improve release quality.',
    requirements:
      'Manual testing fundamentals, API testing basics, careful bug reports, and eagerness to automate.',
    skills: ['Testing', 'API', 'Playwright'],
    benefits: 'Hybrid work, QA mentorship, and learning budget.',
    categoryId: CATEGORY_IDS.engineering,
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.HYBRID,
    experienceLevel: JobExperienceLevel.JUNIOR,
    location: 'Ha Noi, Viet Nam',
    salaryMin: 16000000,
    salaryMax: 26000000,
    numberOfOpenings: 2,
    publishedDaysAgo: 15,
  },
];

const demoDocuments: DemoDocument[] = [
  {
    id: '70000000-0000-4000-8000-000000000101',
    documentType: DocumentType.CERTIFICATE,
    ownerType: DocumentOwnerType.COMPANY,
    ownerId: demoReviewCompanies[0].id,
    fileName: 'greenfield-ai-business-license.pdf',
    mimeType: 'application/pdf',
    size: 238_400,
    key: 'demo/company-verification/greenfield-ai/business-license.pdf',
  },
  {
    id: '70000000-0000-4000-8000-000000000102',
    documentType: DocumentType.CERTIFICATE,
    ownerType: DocumentOwnerType.COMPANY,
    ownerId: demoReviewCompanies[0].id,
    fileName: 'greenfield-ai-tax-certificate.pdf',
    mimeType: 'application/pdf',
    size: 186_240,
    key: 'demo/company-verification/greenfield-ai/tax-certificate.pdf',
  },
  {
    id: '70000000-0000-4000-8000-000000000103',
    documentType: DocumentType.OTHER,
    ownerType: DocumentOwnerType.COMPANY,
    ownerId: demoReviewCompanies[0].id,
    fileName: 'greenfield-ai-domain-proof.png',
    mimeType: 'image/png',
    size: 94_300,
    key: 'demo/company-verification/greenfield-ai/domain-proof.png',
  },
  {
    id: '70000000-0000-4000-8000-000000000201',
    documentType: DocumentType.AVATAR,
    ownerType: DocumentOwnerType.CANDIDATE,
    ownerId: '50000000-0000-4000-8000-000000000001',
    fileName: 'mai-anh-avatar.png',
    mimeType: 'image/png',
    size: 84_120,
    key: 'demo/candidates/mai-anh/avatar.png',
  },
  {
    id: '70000000-0000-4000-8000-000000000202',
    documentType: DocumentType.AVATAR,
    ownerType: DocumentOwnerType.CANDIDATE,
    ownerId: '50000000-0000-4000-8000-000000000002',
    fileName: 'minh-khoa-avatar.png',
    mimeType: 'image/png',
    size: 91_440,
    key: 'demo/candidates/minh-khoa/avatar.png',
  },
  {
    id: '70000000-0000-4000-8000-000000000203',
    documentType: DocumentType.AVATAR,
    ownerType: DocumentOwnerType.CANDIDATE,
    ownerId: '50000000-0000-4000-8000-000000000003',
    fileName: 'linh-chi-avatar.png',
    mimeType: 'image/png',
    size: 88_010,
    key: 'demo/candidates/linh-chi/avatar.png',
  },
  {
    id: '70000000-0000-4000-8000-000000000211',
    documentType: DocumentType.CV,
    ownerType: DocumentOwnerType.CANDIDATE,
    ownerId: '50000000-0000-4000-8000-000000000001',
    fileName: 'mai-anh-frontend-cv.pdf',
    mimeType: 'application/pdf',
    size: 312_720,
    key: 'demo/candidates/mai-anh/frontend-cv.pdf',
  },
  {
    id: '70000000-0000-4000-8000-000000000212',
    documentType: DocumentType.CV,
    ownerType: DocumentOwnerType.CANDIDATE,
    ownerId: '50000000-0000-4000-8000-000000000002',
    fileName: 'minh-khoa-backend-cv.pdf',
    mimeType: 'application/pdf',
    size: 356_140,
    key: 'demo/candidates/minh-khoa/backend-cv.pdf',
  },
  {
    id: '70000000-0000-4000-8000-000000000213',
    documentType: DocumentType.CV,
    ownerType: DocumentOwnerType.CANDIDATE,
    ownerId: '50000000-0000-4000-8000-000000000003',
    fileName: 'linh-chi-product-cv.pdf',
    mimeType: 'application/pdf',
    size: 284_920,
    key: 'demo/candidates/linh-chi/product-cv.pdf',
  },
];

const demoCompanyVerificationDocuments = [
  {
    id: '80000000-0000-4000-8000-000000000101',
    companyId: demoReviewCompanies[0].id,
    documentId: '70000000-0000-4000-8000-000000000101',
    type: CompanyVerificationDocumentType.BUSINESS_LICENSE,
    uploadedByUserId: demoReviewCompanies[0].ownerId,
  },
  {
    id: '80000000-0000-4000-8000-000000000102',
    companyId: demoReviewCompanies[0].id,
    documentId: '70000000-0000-4000-8000-000000000102',
    type: CompanyVerificationDocumentType.TAX_CERTIFICATE,
    uploadedByUserId: demoReviewCompanies[0].ownerId,
  },
  {
    id: '80000000-0000-4000-8000-000000000103',
    companyId: demoReviewCompanies[0].id,
    documentId: '70000000-0000-4000-8000-000000000103',
    type: CompanyVerificationDocumentType.DOMAIN_PROOF,
    uploadedByUserId: demoReviewCompanies[0].ownerId,
  },
];

const demoCandidates: DemoCandidate[] = [
  {
    id: '50000000-0000-4000-8000-000000000001',
    userId: '90000000-0000-4000-8000-000000000001',
    email: 'candidate.mai.anh@nexhire.demo',
    fullName: 'Nguyen Mai Anh',
    phone: '0901000001',
    headline: 'Frontend Engineer focused on React and design systems',
    summary: 'Builds accessible, polished UI for recruitment and SaaS products.',
    location: 'Ha Noi, Viet Nam',
    avatarDocumentId: '70000000-0000-4000-8000-000000000201',
    cvId: '51000000-0000-4000-8000-000000000001',
    cvDocumentId: '70000000-0000-4000-8000-000000000211',
    cvTitle: 'Frontend Engineer CV',
    cvFileName: 'mai-anh-frontend-cv.pdf',
    cvMimeType: 'application/pdf',
    cvSize: 312_720,
  },
  {
    id: '50000000-0000-4000-8000-000000000002',
    userId: '90000000-0000-4000-8000-000000000002',
    email: 'candidate.minh.khoa@nexhire.demo',
    fullName: 'Tran Minh Khoa',
    phone: '0901000002',
    headline: 'Backend Engineer with NestJS and PostgreSQL experience',
    summary: 'Works on service APIs, data models, async workflows, and observability.',
    location: 'Ho Chi Minh City, Viet Nam',
    avatarDocumentId: '70000000-0000-4000-8000-000000000202',
    cvId: '51000000-0000-4000-8000-000000000002',
    cvDocumentId: '70000000-0000-4000-8000-000000000212',
    cvTitle: 'Backend Engineer CV',
    cvFileName: 'minh-khoa-backend-cv.pdf',
    cvMimeType: 'application/pdf',
    cvSize: 356_140,
  },
  {
    id: '50000000-0000-4000-8000-000000000003',
    userId: '90000000-0000-4000-8000-000000000003',
    email: 'candidate.linh.chi@nexhire.demo',
    fullName: 'Pham Linh Chi',
    phone: '0901000003',
    headline: 'Product Designer and growth-minded UX researcher',
    summary: 'Turns research insights into clear product flows and interface systems.',
    location: 'Da Nang, Viet Nam',
    avatarDocumentId: '70000000-0000-4000-8000-000000000203',
    cvId: '51000000-0000-4000-8000-000000000003',
    cvDocumentId: '70000000-0000-4000-8000-000000000213',
    cvTitle: 'Product Designer CV',
    cvFileName: 'linh-chi-product-cv.pdf',
    cvMimeType: 'application/pdf',
    cvSize: 284_920,
  },
];

const demoApplications: DemoApplication[] = [
  {
    id: '60000000-0000-4000-8000-000000000001',
    candidateId: demoCandidates[0].id,
    jobId: demoJobs[0].id,
    status: ApplicationStage.SUBMITTED,
    coverLetter: 'I have built React UI for hiring workflows and would like to join the team.',
    matchScore: 92,
    matchLevel: ApplicationMatchLevel.EXCELLENT,
    submittedDaysAgo: 1,
  },
  {
    id: '60000000-0000-4000-8000-000000000002',
    candidateId: demoCandidates[1].id,
    jobId: demoJobs[1].id,
    status: ApplicationStage.OFFERED,
    coverLetter: 'My NestJS and PostgreSQL background is a strong fit for this backend role.',
    matchScore: 86,
    matchLevel: ApplicationMatchLevel.HIGH,
    submittedDaysAgo: 3,
    statusNote: 'Interview invitation sent by recruiter.',
  },
  {
    id: '60000000-0000-4000-8000-000000000003',
    candidateId: demoCandidates[2].id,
    jobId: demoJobs[4].id,
    status: ApplicationStage.SUBMITTED,
    coverLetter: 'I can support product discovery, interaction design, and handoff quality.',
    matchScore: 78,
    matchLevel: ApplicationMatchLevel.HIGH,
    submittedDaysAgo: 2,
  },
  {
    id: '60000000-0000-4000-8000-000000000004',
    candidateId: demoCandidates[1].id,
    jobId: demoJobs[7].id,
    status: ApplicationStage.REJECTED,
    coverLetter: 'I am interested in platform reliability and data workflows.',
    matchScore: 58,
    matchLevel: ApplicationMatchLevel.MEDIUM,
    submittedDaysAgo: 8,
    statusNote: 'Role requires deeper data platform experience.',
  },
  {
    id: '60000000-0000-4000-8000-000000000005',
    candidateId: demoCandidates[0].id,
    jobId: demoJobs[14].id,
    status: ApplicationStage.WITHDRAWN,
    coverLetter: 'I wanted to explore QA automation but later withdrew this application.',
    matchScore: 49,
    matchLevel: ApplicationMatchLevel.LOW,
    submittedDaysAgo: 9,
    statusNote: 'Candidate withdrew application.',
  },
  {
    id: '60000000-0000-4000-8000-000000000006',
    candidateId: demoCandidates[2].id,
    jobId: demoJobs[2].id,
    status: ApplicationStage.SUBMITTED,
    coverLetter: 'I have managed customer onboarding and product feedback loops before.',
    matchScore: 81,
    matchLevel: ApplicationMatchLevel.HIGH,
    submittedDaysAgo: 4,
  },
];

export async function seedDemoCompanyJob(): Promise<void> {
  const dataSources = [
    authDataSource,
    companyDataSource,
    jobDataSource,
    documentStorageDataSource,
    candidateDataSource,
    applicationDataSource,
  ];

  await initializeAll(dataSources);
  try {
    await seedAuthRoles(authDataSource);
    await seedDemoCompanies(companyDataSource);
    await seedDemoRecruiters(authDataSource);
    await seedDemoDocuments(documentStorageDataSource);
    await seedCompanyVerificationDocuments(companyDataSource);
    await seedDemoCandidateUsers(authDataSource);
    await seedDemoCandidates(candidateDataSource);
    await seedDemoJobs(jobDataSource);
    await seedDemoApplications(applicationDataSource);
    await updateDemoJobApplicationCounts(jobDataSource, applicationDataSource);
  } finally {
    await destroyAll(dataSources.reverse());
  }
}

export const seed = seedDemoCompanyJob;

async function initializeAll(dataSources: DataSource[]): Promise<void> {
  for (const dataSource of dataSources) {
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }
  }
}

async function destroyAll(dataSources: DataSource[]): Promise<void> {
  for (const dataSource of dataSources) {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

async function seedDemoRecruiters(dataSource: DataSource): Promise<void> {
  const role = await dataSource
    .getRepository(Role)
    .findOne({ where: { name: UserRole.RECRUITER } });
  if (!role) {
    throw new Error('RECRUITER role is missing. Run db:auth:seed before demo seed.');
  }

  const userRepo = dataSource.getRepository(User);
  const credentialRepo = dataSource.getRepository(UserCredential);
  const userRoleRepo = dataSource.getRepository(UserRoleEntity);
  const linkRepo = dataSource.getRepository(RecruiterCompanyLink);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, DEMO_BCRYPT_ROUNDS);
  const now = new Date();

  for (const company of allDemoCompanies) {
    const companyStatus = company.status ?? CompanyStatus.APPROVED;

    await userRepo.save(
      userRepo.create({
        id: company.ownerId,
        email: company.recruiterEmail,
        fullName: company.recruiterName,
        avatarUrl: null,
        phone: null,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        lastLoginAt: null,
        statusReason: null,
        statusChangedBy: null,
        statusChangedAt: null,
        suspendedAt: null,
        bannedAt: null,
        archivedAt: null,
      }),
    );

    const existingCredential = await credentialRepo.findOne({ where: { userId: company.ownerId } });
    await credentialRepo.save(
      credentialRepo.create({
        id: existingCredential?.id,
        userId: company.ownerId,
        passwordHash,
        passwordAlgorithm: PasswordAlgorithm.BCRYPT,
        passwordUpdatedAt: now,
        failedLoginAttempts: 0,
        lockedUntil: null,
      }),
    );

    const existingUserRole = await userRoleRepo.findOne({
      where: { userId: company.ownerId, roleId: role.id },
    });
    if (!existingUserRole) {
      await userRoleRepo.save(userRoleRepo.create({ userId: company.ownerId, roleId: role.id }));
    }

    const existingLink = await linkRepo.findOne({ where: { userId: company.ownerId } });
    await linkRepo.save(
      linkRepo.create({
        id: existingLink?.id,
        userId: company.ownerId,
        companyId: company.id,
        companyName: company.name,
        companyLogoUrl: company.logo,
        companyLogoDocumentId: null,
        companyStatus,
        lastSyncedAt: now,
      }),
    );
  }
}

async function seedDemoCandidateUsers(dataSource: DataSource): Promise<void> {
  const role = await dataSource
    .getRepository(Role)
    .findOne({ where: { name: UserRole.CANDIDATE } });
  if (!role) {
    throw new Error('CANDIDATE role is missing. Run db:auth:seed before demo seed.');
  }

  const userRepo = dataSource.getRepository(User);
  const credentialRepo = dataSource.getRepository(UserCredential);
  const userRoleRepo = dataSource.getRepository(UserRoleEntity);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, DEMO_BCRYPT_ROUNDS);
  const now = new Date();

  for (const candidate of demoCandidates) {
    await userRepo.save(
      userRepo.create({
        id: candidate.userId,
        email: candidate.email,
        fullName: candidate.fullName,
        avatarUrl: null,
        phone: candidate.phone,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        lastLoginAt: null,
        statusReason: null,
        statusChangedBy: null,
        statusChangedAt: null,
        suspendedAt: null,
        bannedAt: null,
        archivedAt: null,
      }),
    );

    const existingCredential = await credentialRepo.findOne({
      where: { userId: candidate.userId },
    });
    await credentialRepo.save(
      credentialRepo.create({
        id: existingCredential?.id,
        userId: candidate.userId,
        passwordHash,
        passwordAlgorithm: PasswordAlgorithm.BCRYPT,
        passwordUpdatedAt: now,
        failedLoginAttempts: 0,
        lockedUntil: null,
      }),
    );

    const existingUserRole = await userRoleRepo.findOne({
      where: { userId: candidate.userId, roleId: role.id },
    });
    if (!existingUserRole) {
      await userRoleRepo.save(userRoleRepo.create({ userId: candidate.userId, roleId: role.id }));
    }
  }
}

async function seedDemoCompanies(dataSource: DataSource): Promise<void> {
  const companyRepo = dataSource.getRepository(Company);
  const now = new Date();

  for (const company of allDemoCompanies) {
    const status = company.status ?? CompanyStatus.APPROVED;

    await companyRepo.save(
      companyRepo.create({
        id: company.id,
        name: company.name,
        logo: company.logo,
        logoDocumentId: null,
        description: company.description,
        industry: company.industry,
        size: company.size,
        foundedYear: company.foundedYear,
        mission: company.mission,
        culture: company.culture,
        values: company.values,
        perks: company.perks,
        heroImageUrl: company.heroImageUrl,
        heroImageDocumentId: null,
        website: company.website,
        contactEmail: company.contactEmail,
        contactPhone: company.contactPhone,
        address: company.address,
        taxCode: company.taxCode,
        ownerId: company.ownerId,
        status,
        statusReason: company.statusReason ?? null,
        statusChangedAt: status === CompanyStatus.APPROVED ? null : now,
        statusChangedByUserId: status === CompanyStatus.APPROVED ? null : ADMIN_REVIEWER_ID,
        trustLevel: company.trustLevel,
        approvedLowRiskCount: company.approvedLowRiskCount,
        negativeTrustSignalCount: company.negativeTrustSignalCount ?? 0,
      }),
    );
  }
}

async function seedDemoDocuments(dataSource: DataSource): Promise<void> {
  const documentRepo = dataSource.getRepository(Document);

  for (const document of demoDocuments) {
    const existingDocument = await documentRepo.findOne({
      where: { id: document.id },
      withDeleted: true,
    });
    await documentRepo.save(
      documentRepo.create({
        ...document,
        deletedAt: null,
        createdAt: existingDocument?.createdAt,
      }),
    );
  }
}

async function seedCompanyVerificationDocuments(dataSource: DataSource): Promise<void> {
  const verificationDocumentRepo = dataSource.getRepository(CompanyVerificationDocument);

  for (const document of demoCompanyVerificationDocuments) {
    const existingDocument = await verificationDocumentRepo.findOne({
      where: { id: document.id },
      withDeleted: true,
    });

    await verificationDocumentRepo.save(
      verificationDocumentRepo.create({
        ...document,
        deletedAt: null,
        createdAt: existingDocument?.createdAt,
      }),
    );
  }
}

async function seedDemoCandidates(dataSource: DataSource): Promise<void> {
  const candidateRepo = dataSource.getRepository(CandidateProfile);
  const cvRepo = dataSource.getRepository(CandidateCv);

  for (const candidate of demoCandidates) {
    await candidateRepo.save(
      candidateRepo.create({
        id: candidate.id,
        userId: candidate.userId,
        fullName: candidate.fullName,
        phone: candidate.phone,
        contactEmail: candidate.email,
        avatarDocumentId: candidate.avatarDocumentId,
        headline: candidate.headline,
        summary: candidate.summary,
        location: candidate.location,
        portfolioUrl: null,
        linkedinUrl: null,
        openToWork: true,
        visibility: CandidateProfileVisibility.PUBLIC,
      }),
    );

    await cvRepo.save(
      cvRepo.create({
        id: candidate.cvId,
        candidateId: candidate.id,
        documentId: candidate.cvDocumentId,
        title: candidate.cvTitle,
        isDefault: true,
        parseStatus: CandidateCvParseStatus.PARSED,
        parsedAt: new Date(),
        deletedAt: null,
        documentDeletedAt: null,
        documentDeleteError: null,
      }),
    );
  }
}

async function seedDemoJobs(dataSource: DataSource): Promise<void> {
  const jobRepo = dataSource.getRepository(Job);
  const reviewRepo = dataSource.getRepository(JobModerationReview);
  const searchTextService = new JobSearchTextService();
  const now = new Date();
  const deadline = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);

  await ensureDemoCategoriesExist(dataSource);

  for (const job of demoJobs) {
    const company = demoCompanies.find((item) => item.id === job.companyId);
    if (!company) {
      throw new Error(`Missing demo company for job ${job.id}`);
    }

    const publishedAt = new Date(now.getTime() - job.publishedDaysAgo * 24 * 60 * 60 * 1000);
    const searchFields = searchTextService.buildSearchFields(job, company.name);
    const existingJob = await jobRepo.findOne({ where: { id: job.id }, withDeleted: true });

    await jobRepo.save(
      jobRepo.create({
        id: job.id,
        companyId: company.id,
        companyName: company.name,
        companyLogoUrl: company.logo,
        companyLogoDocumentId: null,
        companyStatus: CompanyStatusSnapshot.APPROVED,
        companyTrustLevel: mapTrustLevel(company.trustLevel),
        companySnapshotAt: now,
        createdByUserId: company.ownerId,
        title: job.title,
        description: job.description,
        requirements: job.requirements,
        skills: searchTextService.normalizeSkills(job.skills),
        benefits: job.benefits,
        categoryId: job.categoryId,
        employmentType: job.employmentType,
        workingType: job.workingType,
        experienceLevel: job.experienceLevel,
        location: job.location,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: 'VND',
        isSalaryVisible: true,
        deadline,
        numberOfOpenings: job.numberOfOpenings,
        status: JobStatus.PUBLISHED,
        version: 1,
        applicationCount: existingJob?.applicationCount ?? 0,
        publishedAt,
        closedAt: null,
        expiresAt: deadline,
        riskScore: 0,
        riskLevel: JobModerationRiskLevel.LOW,
        moderationDecision: JobModerationDecision.PENDING_REVIEW,
        moderationReasons: ['Demo seed: safe job already approved by admin'],
        moderationMatchedRules: [],
        reviewedByUserId: ADMIN_REVIEWER_ID,
        reviewedAt: publishedAt,
        reviewReason: 'Demo seed approved job',
        unpublishedByUserId: null,
        unpublishedAt: null,
        unpublishReason: null,
        deletedAt: null,
        ...searchFields,
      }),
    );

    await reviewRepo.save(
      reviewRepo.create({
        id: job.id.replace('30000000', '40000000'),
        jobId: job.id,
        targetType: JobModerationTargetType.JOB,
        targetId: job.id,
        riskScore: 0,
        riskLevel: JobModerationRiskLevel.LOW,
        decision: JobModerationDecision.PENDING_REVIEW,
        reasons: ['Demo seed: safe job already approved by admin'],
        matchedRules: [],
        reviewedByUserId: ADMIN_REVIEWER_ID,
        reviewedAt: publishedAt,
        adminDecision: JobReviewDecision.APPROVE,
        adminReason: 'Demo seed approved job',
        deletedAt: null,
      }),
    );
  }
}

async function seedDemoApplications(dataSource: DataSource): Promise<void> {
  const applicationRepo = dataSource.getRepository(Application);
  const now = new Date();

  for (const item of demoApplications) {
    const job = demoJobs.find((demoJob) => demoJob.id === item.jobId);
    const candidate = demoCandidates.find((demoCandidate) => demoCandidate.id === item.candidateId);
    if (!job || !candidate) {
      throw new Error(`Missing demo application references for application ${item.id}`);
    }

    const company = demoCompanies.find((demoCompany) => demoCompany.id === job.companyId);
    if (!company) {
      throw new Error(`Missing demo company for application ${item.id}`);
    }

    const submittedAt = new Date(now.getTime() - item.submittedDaysAgo * 24 * 60 * 60 * 1000);
    const decidedAt =
      item.status === ApplicationStage.OFFERED || item.status === ApplicationStage.REJECTED
        ? new Date(submittedAt.getTime() + 2 * 24 * 60 * 60 * 1000)
        : null;
    const withdrawnAt =
      item.status === ApplicationStage.WITHDRAWN
        ? new Date(submittedAt.getTime() + 24 * 60 * 60 * 1000)
        : null;

    await applicationRepo.save(
      applicationRepo.create({
        id: item.id,
        jobId: job.id,
        jobTitle: job.title,
        companyId: company.id,
        companyName: company.name,
        companyLogoUrl: company.logo,
        companyLogoDocumentId: null,
        candidateId: candidate.id,
        candidateUserId: candidate.userId,
        candidateFullName: candidate.fullName,
        candidateEmail: candidate.email,
        candidatePhone: candidate.phone,
        candidateAvatarDocumentId: candidate.avatarDocumentId,
        candidateCvId: candidate.cvId,
        cvDocumentId: candidate.cvDocumentId,
        cvTitle: candidate.cvTitle,
        cvFileName: candidate.cvFileName,
        cvMimeType: candidate.cvMimeType,
        cvSize: candidate.cvSize,
        cvParseStatus: CandidateCvParseStatus.PARSED,
        coverLetter: item.coverLetter,
        status: item.status,
        statusNote: item.statusNote ?? null,
        matchScore: item.matchScore,
        matchLevel: item.matchLevel,
        submittedAt,
        withdrawnAt,
        decidedAt,
        cancelledAt: null,
        deletedAt: null,
      }),
    );
  }
}

async function updateDemoJobApplicationCounts(
  jobDataSource: DataSource,
  applicationDataSource: DataSource,
): Promise<void> {
  const jobRepo = jobDataSource.getRepository(Job);
  const applicationRepo = applicationDataSource.getRepository(Application);

  for (const job of demoJobs) {
    const applicationCount = await applicationRepo.count({
      where: { jobId: job.id },
      withDeleted: false,
    });

    await jobRepo.update(job.id, { applicationCount });
  }
}

async function ensureDemoCategoriesExist(dataSource: DataSource): Promise<void> {
  try {
    const rows = await dataSource.query<{ id: string }[]>(
      'SELECT "id" FROM "job_categories" WHERE "id" = ANY($1::uuid[])',
      [Object.values(CATEGORY_IDS)],
    );
    const foundIds = new Set(rows.map((row) => row.id));
    const missingIds = Object.values(CATEGORY_IDS).filter((id) => !foundIds.has(id));

    if (missingIds.length > 0) {
      throw new Error(
        `Missing demo job categories: ${missingIds.join(
          ', ',
        )}. Run npm run db:job:run before this seed.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Missing demo job categories')) {
      throw error;
    }
    throw new Error(
      `Cannot read job_categories. Run npm run db:job:run before this seed. Cause: ${
        (error as Error).message
      }`,
    );
  }
}

function mapTrustLevel(value: SharedCompanyTrustLevel): CompanyTrustLevel {
  switch (value) {
    case SharedCompanyTrustLevel.HIGH:
      return CompanyTrustLevel.HIGH;
    case SharedCompanyTrustLevel.LOW:
      return CompanyTrustLevel.LOW;
    case SharedCompanyTrustLevel.MEDIUM:
    default:
      return CompanyTrustLevel.MEDIUM;
  }
}
