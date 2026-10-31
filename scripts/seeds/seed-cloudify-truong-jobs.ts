import { DataSource } from 'typeorm';
import {
  JobExperienceLevel,
  JobModerationDecision,
  JobModerationRiskLevel,
  JobStatus,
  JobType,
  JobWorkingType,
} from '@nexhire/shared';
import jobDataSource from '../../apps/job-service/data-source';
import { Job } from '../../apps/job-service/src/job/entities/job.entity';
import { JobSearchTextService } from '../../apps/job-service/src/job/search/job-search-text.service';
import {
  CompanyStatusSnapshot,
  CompanyTrustLevel,
} from '../../apps/job-service/src/job/entities/job.enum';

const CLOUDIFY_COMPANY_ID = '10000000-0000-4000-8000-000000000002';
const CLOUDIFY_OWNER_ID = '20000000-0000-4000-8000-000000000002';
const CLOUDIFY_COMPANY_NAME = 'Cloudify VN';
const CLOUDIFY_LOGO = 'https://cdn.nexhire.vn/demo/companies/cloudify-vn.png';
const CATEGORY_ENGINEERING = '11111111-1111-4111-8111-111111111111';
const ADMIN_REVIEWER_ID = '00000000-0000-4000-8000-000000000001';

export const truongTestJobs = [
  {
    id: '30000000-0000-4000-8000-000000000091',
    title: 'Mid Fullstack Developer (FastAPI / React / TypeScript)',
    description:
      'Tham gia phát triển nền tảng Cloud Platform tại Cloudify VN. Thiết kế và phát triển RESTful APIs, xây dựng giao diện web SPA hiện đại, tích hợp tính năng realtime và tự động hóa quy trình nghiệp vụ.',
    requirements:
      'Phát triển backend RESTful API và background services bằng Python (FastAPI) hoặc Node.js. Xây dựng giao diện web SPA trực quan bằng ReactJS, TypeScript và Tailwind CSS. Thành thạo cơ sở dữ liệu quan hệ PostgreSQL và caching Redis. Kinh nghiệm làm việc với realtime (WebSocket hoặc WebRTC), background workers, cron scheduler và container hóa Docker. Tư duy clean code, chủ động thực hiện code review và kiểm thử tự động CI/CD.',
    skills: ['FastAPI', 'React', 'TypeScript', 'PostgreSQL', 'Docker', 'REST API', 'WebSocket', 'Node.js'],
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.HYBRID,
    experienceLevel: JobExperienceLevel.MIDDLE,
    location: 'District 1, Ho Chi Minh City',
    salaryMin: 25000000,
    salaryMax: 42000000,
    numberOfOpenings: 2,
    publishedDaysAgo: 1,
  },
  {
    id: '30000000-0000-4000-8000-000000000092',
    title: 'AI & Automation Engineer (FastAPI, LangGraph, LLM Workflow)',
    description:
      'Phát triển hệ sinh thái AI copilot và workflow automation platform phục vụ quản lý hệ thống đám mây. Tích hợp các LLM agent vào canvas tự động hóa để tăng tốc độ vận hành cho doanh nghiệp.',
    requirements:
      'Lập trình backend thành thạo với Python và FastAPI. Kinh nghiệm xây dựng AI agents, workflow orchestration bằng LangChain hoặc LangGraph. Tích hợp các LLM APIs (OpenAI, Claude, Gemini) và thiết kế prompt / tool use cho AI assistant. Xây dựng webhook receivers, tích hợp third-party APIs (Zalo, Notion, Slack) và background task processing. Hiểu biết về Docker, GitLab CI và kiến trúc event-driven.',
    skills: ['Python', 'FastAPI', 'LangGraph', 'LLM', 'AI Agents', 'Docker', 'GitLab CI', 'PostgreSQL'],
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.REMOTE,
    experienceLevel: JobExperienceLevel.MIDDLE,
    location: 'Remote, Viet Nam',
    salaryMin: 28000000,
    salaryMax: 48000000,
    numberOfOpenings: 2,
    publishedDaysAgo: 1,
  },
  {
    id: '30000000-0000-4000-8000-000000000093',
    title: 'Senior Java Cloud Architect (Spring Boot, Kafka, AWS)',
    description:
      'Chịu trách nhiệm kiến trúc và phát triển hệ thống thanh toán và dữ liệu phân tán quy mô lớn trên hạ tầng AWS Cloud.',
    requirements:
      'Tối thiểu 5+ năm kinh nghiệm phát triển phần mềm với Java core, Spring Boot và Spring Cloud. Thiết kế kiến trúc Microservices phân tán với Apache Kafka, event streaming và caching phân tán. Quản trị và tối ưu cơ sở dữ liệu quan hệ Oracle hoặc SQL Server cho các bài toán xử lý giao dịch tài chính ACID. Kinh nghiệm triển khai production trên AWS (ECS, EKS, RDS, S3, CloudWatch).',
    skills: ['Java', 'Spring Boot', 'Kafka', 'AWS', 'Microservices', 'Oracle'],
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.HYBRID,
    experienceLevel: JobExperienceLevel.SENIOR,
    location: 'District 1, Ho Chi Minh City',
    salaryMin: 45000000,
    salaryMax: 70000000,
    numberOfOpenings: 1,
    publishedDaysAgo: 2,
  },
];

export async function seedCloudifyTruongJobs(dataSource: DataSource): Promise<void> {
  const jobRepo = dataSource.getRepository(Job);
  const searchTextService = new JobSearchTextService();
  const now = new Date();
  const deadline = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);

  for (const job of truongTestJobs) {
    const publishedAt = new Date(now.getTime() - job.publishedDaysAgo * 24 * 60 * 60 * 1000);
    const searchFields = searchTextService.buildSearchFields(job, CLOUDIFY_COMPANY_NAME);
    const existingJob = await jobRepo.findOne({ where: { id: job.id }, withDeleted: true });

    await jobRepo.save(
      jobRepo.create({
        id: job.id,
        companyId: CLOUDIFY_COMPANY_ID,
        companyName: CLOUDIFY_COMPANY_NAME,
        companyLogoUrl: CLOUDIFY_LOGO,
        companyLogoDocumentId: null,
        companyStatus: CompanyStatusSnapshot.APPROVED,
        companyTrustLevel: CompanyTrustLevel.HIGH,
        companySnapshotAt: now,
        createdByUserId: CLOUDIFY_OWNER_ID,
        title: job.title,
        description: job.description,
        requirements: job.requirements,
        skills: searchTextService.normalizeSkills(job.skills),
        benefits: 'Lương thưởng cạnh tranh, bảo hiểm quốc tế, ngân sách học tập và chứng chỉ cloud, làm việc linh hoạt.',
        categoryId: CATEGORY_ENGINEERING,
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
        moderationReasons: ['Cloudify target testing job for AI1 verification'],
        moderationMatchedRules: [],
        reviewedByUserId: ADMIN_REVIEWER_ID,
        reviewedAt: publishedAt,
        reviewReason: 'Approved for AI1 evaluation demo',
        unpublishedByUserId: null,
        unpublishedAt: null,
        unpublishReason: null,
        deletedAt: null,
        ...searchFields,
      }),
    );
    console.log(`[Job Seeded] ${job.title} (${job.id})`);
  }
}

export async function seed(): Promise<void> {
  await jobDataSource.initialize();
  try {
    await seedCloudifyTruongJobs(jobDataSource);
    console.log('Seeded Cloudify test jobs successfully!');
  } finally {
    await jobDataSource.destroy();
  }
}

export default seed;
