import { ConflictException } from '@nestjs/common';
import { UserRole } from '@nexhire/shared';
import { DataSource, Repository } from 'typeorm';
import {
  JobModerationPolicy,
  JobModerationPolicyStatus,
} from '../entities/job-moderation-policy.entity';
import { JobModerationPolicyService } from '../moderation/job-moderation-policy.service';
import {
  DEFAULT_JOB_MODERATION_POLICY_RULES,
  JobModerationService,
} from '../moderation/job-moderation.service';

describe('JobModerationPolicyService', () => {
  const admin = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'admin@nexhire.test',
    role: UserRole.ADMIN,
  };

  const activePolicy = {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Active policy',
    status: JobModerationPolicyStatus.ACTIVE,
    version: 1,
    rules: DEFAULT_JOB_MODERATION_POLICY_RULES,
    createdByUserId: admin.id,
    updatedByUserId: admin.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as JobModerationPolicy;

  let policyRepo: {
    create: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let service: JobModerationPolicyService;

  beforeEach(() => {
    policyRepo = {
      create: jest.fn((policy) => policy),
      findOne: jest.fn(),
      save: jest.fn((policy) => Promise.resolve(policy)),
    };
    service = new JobModerationPolicyService(
      {} as DataSource,
      policyRepo as unknown as Repository<JobModerationPolicy>,
      {} as JobModerationService,
    );
  });

  it('does not allow editing rules of the active policy', async () => {
    policyRepo.findOne.mockResolvedValue({ ...activePolicy });

    await expect(
      service.update(admin, activePolicy.id, {
        rules: {
          ...DEFAULT_JOB_MODERATION_POLICY_RULES,
          thresholds: { medium: 30, high: 60, critical: 90 },
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(policyRepo.save).not.toHaveBeenCalled();
  });

  it('allows renaming the active policy without changing its version', async () => {
    policyRepo.findOne.mockResolvedValue({ ...activePolicy });

    const result = await service.update(admin, activePolicy.id, { name: 'Renamed active policy' });

    expect(result.name).toBe('Renamed active policy');
    expect(result.version).toBe(1);
    expect(policyRepo.save).toHaveBeenCalled();
  });

  it('does not allow archiving the active policy directly', async () => {
    policyRepo.findOne.mockResolvedValue({ ...activePolicy });

    await expect(service.archive(admin, activePolicy.id)).rejects.toBeInstanceOf(ConflictException);

    expect(policyRepo.save).not.toHaveBeenCalled();
  });

  it('publishes a draft policy and marks the previous active policy as unpublished', async () => {
    const draftPolicy = {
      ...activePolicy,
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Draft policy',
      status: JobModerationPolicyStatus.DRAFT,
    };
    const txRepo = {
      findOne: jest.fn().mockResolvedValue({ ...draftPolicy }),
      update: jest.fn(),
      save: jest.fn((policy) => Promise.resolve(policy)),
    };
    service = new JobModerationPolicyService(
      {
        transaction: jest.fn((callback) =>
          callback({
            getRepository: jest.fn(() => txRepo),
          }),
        ),
      } as unknown as DataSource,
      policyRepo as unknown as Repository<JobModerationPolicy>,
      {} as JobModerationService,
    );

    const result = await service.publish(admin, draftPolicy.id);

    expect(txRepo.update).toHaveBeenCalledWith(
      { status: JobModerationPolicyStatus.ACTIVE },
      { status: JobModerationPolicyStatus.UNPUBLISHED, updatedByUserId: admin.id },
    );
    expect(result.status).toBe(JobModerationPolicyStatus.ACTIVE);
    expect(result.name).toBe('Draft policy');
  });

  it('does not publish archived policies', async () => {
    const archivedPolicy = {
      ...activePolicy,
      status: JobModerationPolicyStatus.ARCHIVED,
    };
    const txRepo = {
      findOne: jest.fn().mockResolvedValue({ ...archivedPolicy }),
      update: jest.fn(),
      save: jest.fn(),
    };
    service = new JobModerationPolicyService(
      {
        transaction: jest.fn((callback) =>
          callback({
            getRepository: jest.fn(() => txRepo),
          }),
        ),
      } as unknown as DataSource,
      policyRepo as unknown as Repository<JobModerationPolicy>,
      {} as JobModerationService,
    );

    await expect(service.publish(admin, archivedPolicy.id)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(txRepo.update).not.toHaveBeenCalled();
    expect(txRepo.save).not.toHaveBeenCalled();
  });

  it('rejects malformed rule arrays before saving', async () => {
    await expect(
      service.create(admin, {
        name: 'Malformed policy',
        rules: {
          ...DEFAULT_JOB_MODERATION_POLICY_RULES,
          linkRules: {
            ...DEFAULT_JOB_MODERATION_POLICY_RULES.linkRules,
            shortenedDomains: 'bit.ly' as unknown as string[],
          },
        },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'JOB.INVALID_MODERATION_POLICY',
      }),
    });
  });

  it('allows duplicate keyword rule ids for aliases', async () => {
    policyRepo.save.mockImplementation((policy) =>
      Promise.resolve({ ...policy, id: activePolicy.id }),
    );

    const result = await service.create(admin, {
      name: 'Alias policy',
      rules: {
        ...DEFAULT_JOB_MODERATION_POLICY_RULES,
        keywordRules: [
          {
            id: 'RISK_ALIAS',
            keyword: 'can cuoc cong dan',
            score: 25,
            reason: 'Sensitive document request',
            enabled: true,
          },
          {
            id: 'RISK_ALIAS',
            keyword: 'cccd',
            score: 25,
            reason: 'Sensitive document request',
            enabled: true,
          },
        ],
      },
    });

    expect(result.name).toBe('Alias policy');
  });

  it('rejects duplicate keyword text within the same policy', async () => {
    await expect(
      service.create(admin, {
        name: 'Duplicate keyword policy',
        rules: {
          ...DEFAULT_JOB_MODERATION_POLICY_RULES,
          keywordRules: [
            {
              id: 'RISK_DUPLICATE_A',
              keyword: 'dong phi',
              score: 30,
              reason: 'First duplicate keyword',
              enabled: true,
            },
            {
              id: 'RISK_DUPLICATE_B',
              keyword: 'Đóng phí',
              score: 40,
              reason: 'Second duplicate keyword',
              enabled: true,
            },
            {
              id: 'RISK_DUPLICATE_C',
              keyword: 'DONG PHI',
              score: 40,
              reason: 'Third duplicate keyword',
              enabled: true,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'JOB.INVALID_MODERATION_POLICY',
      }),
    });
  });
});
