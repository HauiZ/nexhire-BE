import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UserRole } from '@nexhire/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReviewWorkspaceService } from '../review-workspace.service';
import { SaveReviewWorkspaceDto } from '../dto/review-workspace.dto';

const user = { id: 'reviewer', role: UserRole.RECRUITER, companyId: 'company' };
const current = {
  resultId: 'result',
  assessmentStatus: 'PENDING_REVIEW',
  jobSnapshotSha256: 'a'.repeat(64),
  candidateSnapshotSha256: 'b'.repeat(64),
  requirements: [
    {
      requirementId: 'r1',
      text: 'Maintain backups',
      evidence: [{ evidenceId: 'e1', text: 'Tested restores', source: 'project' }],
    },
  ],
};
function dto(): SaveReviewWorkspaceDto {
  return {
    expectedRevision: 0,
    resultId: 'result',
    jobSnapshotSha256: 'a'.repeat(64),
    candidateSnapshotSha256: 'b'.repeat(64),
    requirements: [
      { requirementId: 'r1', status: 'CLARIFY', note: 'Ask about scope', evidenceIds: ['e1'] },
    ],
    questions: [],
    interviewStatus: 'DRAFT',
  };
}

describe('ReviewWorkspaceService', () => {
  const applications = { findOne: jest.fn() };
  const reviews = { findOne: jest.fn(), insert: jest.fn() };
  const service = { getCompanyApplicationHrReview: jest.fn() };
  const workspace = new ReviewWorkspaceService(
    applications as never,
    reviews as never,
    service as never,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    applications.findOne.mockResolvedValue({ id: 'app' });
    reviews.findOne.mockResolvedValue(null);
    service.getCompanyApplicationHrReview.mockResolvedValue(current);
    reviews.insert.mockResolvedValue({});
  });
  it('rejects nested arrays as question and requirement objects at the DTO boundary', async () => {
    for (const field of ['questions', 'requirements']) {
      const input = plainToInstance(SaveReviewWorkspaceDto, { ...dto(), [field]: [[]] });
      const errors = await validate(input);
      expect(errors.find((error) => error.property === field)?.constraints?.isObject).toBeDefined();
    }
  });
  it('checks company and role before any review or evidence lookup', async () => {
    await expect(
      workspace.read({ ...user, role: UserRole.CANDIDATE }, 'app'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    applications.findOne.mockResolvedValue(null);
    await expect(workspace.read(user, 'app')).rejects.toBeInstanceOf(NotFoundException);
    expect(reviews.findOne).not.toHaveBeenCalled();
    expect(service.getCompanyApplicationHrReview).not.toHaveBeenCalled();
  });
  it('appends a bound revision with server-derived evidence and author', async () => {
    const result = await workspace.save(user, 'app', dto());
    expect(result.document.revision).toBe(1);
    expect(result.document.reviewerId).toBe(user.id);
    expect(result.document.sourceRequirements[0].evidence[0].text).toBe('Tested restores');
    expect(result.isTrainingLabel).toBe(false);
    expect(result.hiringDecision).toBeNull();
    expect(reviews.insert).toHaveBeenCalledTimes(1);
  });
  it('rejects changed snapshots before writing', async () => {
    await expect(workspace.save(user, 'app', { ...dto(), resultId: 'old' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(reviews.insert).not.toHaveBeenCalled();
  });
  it('rejects foreign or duplicate evidence and requirement IDs', async () => {
    for (const requirements of [
      [{ ...dto().requirements[0], evidenceIds: ['foreign'] }],
      [{ ...dto().requirements[0], evidenceIds: ['e1', 'e1'] }],
      [{ ...dto().requirements[0], requirementId: 'foreign' }],
      [...dto().requirements, ...dto().requirements],
    ])
      await expect(workspace.save(user, 'app', { ...dto(), requirements })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    expect(reviews.insert).not.toHaveBeenCalled();
  });
  it('requires complete answers to finish a sheet', async () => {
    await expect(
      workspace.save(user, 'app', { ...dto(), interviewStatus: 'COMPLETED' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      workspace.save(user, 'app', {
        ...dto(),
        interviewStatus: 'COMPLETED',
        questions: [{ id: 'q', question: 'Scope?', answer: ' ', note: '' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('saves a completed interview with an answer and optional requirement binding', async () => {
    const result = await workspace.save(user, 'app', {
      ...dto(),
      interviewStatus: 'COMPLETED',
      questions: [
        { id: 'q', requirementId: 'r1', question: 'Scope?', answer: 'Restored staging.', note: '' },
      ],
    });
    expect(result.document.interviewStatus).toBe('COMPLETED');
    expect(result.document.questions[0].answer).toBe('Restored staging.');
  });
  it('rejects empty, foreign-bound and duplicate questions before writing', async () => {
    const question = { id: 'q', question: 'Scope?', answer: '', note: '' };
    for (const questions of [
      [{ ...question, question: ' ' }],
      [{ ...question, requirementId: 'foreign' }],
      [question, question],
    ]) {
      await expect(workspace.save(user, 'app', { ...dto(), questions })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(reviews.insert).not.toHaveBeenCalled();
  });
  it('rejects stale revisions and concurrent unique collisions without overwrite', async () => {
    reviews.findOne.mockResolvedValue({ revision: 2 });
    await expect(workspace.save(user, 'app', dto())).rejects.toBeInstanceOf(ConflictException);
    reviews.findOne.mockResolvedValue(null);
    reviews.insert.mockRejectedValue({ code: '23505' });
    await expect(workspace.save(user, 'app', dto())).rejects.toBeInstanceOf(ConflictException);
  });
  it('returns persisted notes read-only when matching is unavailable', async () => {
    reviews.findOne.mockResolvedValue({ revision: 1, ...dto() });
    service.getCompanyApplicationHrReview.mockRejectedValue(new ServiceUnavailableException());
    const response = await workspace.read(user, 'app');
    expect(response.document?.revision).toBe(1);
    expect(response.freshnessUnavailable).toBe(true);
    expect(response.stale).toBe(true);
  });
  it('keeps old source content readable and marks changed results stale', async () => {
    reviews.findOne.mockResolvedValue({ revision: 1, ...dto(), resultId: 'old' });
    const response = await workspace.read(user, 'app');
    expect(response.stale).toBe(true);
    expect(response.document?.resultId).toBe('old');
    expect(reviews.insert).not.toHaveBeenCalled();
  });
});
