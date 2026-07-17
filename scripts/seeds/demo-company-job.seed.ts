import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import {
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
  address: string;
  description: string;
  trustLevel: SharedCompanyTrustLevel;
  approvedLowRiskCount: number;
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
    address: 'Cau Giay, Ha Noi',
    description: 'Product engineering company building recruitment and HR automation platforms.',
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
    address: 'District 1, Ho Chi Minh City',
    description:
      'Cloud consulting and platform team delivering scalable systems for regional clients.',
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
    address: 'Hai Chau, Da Nang',
    description:
      'Growth and marketing studio helping SaaS teams improve acquisition and retention.',
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
    address: 'Thanh Xuan, Ha Noi',
    description: 'Mobile-first product studio focused on fintech and marketplace applications.',
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
    address: 'Thu Duc, Ho Chi Minh City',
    description: 'Design studio creating product experiences for consumer and business software.',
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
    address: 'Ba Dinh, Ha Noi',
    description: 'Data and revenue operations team supporting B2B companies across APAC.',
    trustLevel: SharedCompanyTrustLevel.MEDIUM,
    approvedLowRiskCount: 3,
  },
];

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

export async function seedDemoCompanyJob(): Promise<void> {
  await initializeAll([authDataSource, companyDataSource, jobDataSource]);
  try {
    await seedAuthRoles(authDataSource);
    await seedDemoCompanies(companyDataSource);
    await seedDemoRecruiters(authDataSource);
    await seedDemoJobs(jobDataSource);
  } finally {
    await destroyAll([jobDataSource, companyDataSource, authDataSource]);
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

  for (const company of demoCompanies) {
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
        companyStatus: CompanyStatus.APPROVED,
        lastSyncedAt: now,
      }),
    );
  }
}

async function seedDemoCompanies(dataSource: DataSource): Promise<void> {
  const companyRepo = dataSource.getRepository(Company);

  for (const company of demoCompanies) {
    await companyRepo.save(
      companyRepo.create({
        id: company.id,
        name: company.name,
        logo: company.logo,
        logoDocumentId: null,
        description: company.description,
        website: company.website,
        address: company.address,
        taxCode: company.taxCode,
        ownerId: company.ownerId,
        status: CompanyStatus.APPROVED,
        trustLevel: company.trustLevel,
        approvedLowRiskCount: company.approvedLowRiskCount,
        negativeTrustSignalCount: 0,
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
