import { ResumeNormalizerService } from '../resume-normalizer.service';

describe('ResumeNormalizerService', () => {
  let service: ResumeNormalizerService;

  beforeEach(() => {
    service = new ResumeNormalizerService();
  });

  it('normalizes common Skima resume fields into the shared ParsedResume shape', () => {
    const result = service.normalize({
      resume: {
        name: 'Jane Candidate',
        email: 'jane@example.com',
        phoneNumber: '+84901234567',
        technicalSkills: [{ skill: 'NestJS', proficiency: 'advanced', years: '3' }],
        workExperience: [
          {
            company: 'NexHire',
            title: 'Backend Engineer',
            startYear: '2024',
            current: true,
          },
        ],
        education: [{ institution: 'HCMUT', degree: 'BS' }],
        certificates: [{ certification: 'AWS SAA', organization: 'AWS', year: '2025' }],
        personalProjects: [{ title: 'CV Matching', techStack: ['NestJS', 'PostgreSQL'] }],
      },
    });

    expect(result.profile.fullName).toBe('Jane Candidate');
    expect(result.profile.contactEmail).toBe('jane@example.com');
    expect(result.skills[0]).toEqual({
      name: 'NestJS',
      level: 'advanced',
      yearsOfExperience: 3,
    });
    expect(result.experiences[0]).toMatchObject({
      companyName: 'NexHire',
      position: 'Backend Engineer',
      startYear: 2024,
      isCurrent: true,
    });
    expect(result.educations[0].schoolName).toBe('HCMUT');
    expect(result.certifications[0].name).toBe('AWS SAA');
    expect(result.projects[0].technologies).toEqual(['NestJS', 'PostgreSQL']);
  });
});
