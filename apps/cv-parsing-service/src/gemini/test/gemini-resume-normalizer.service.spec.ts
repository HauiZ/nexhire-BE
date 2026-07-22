import { GeminiResumeNormalizerService } from '../gemini-resume-normalizer.service';

describe('GeminiResumeNormalizerService', () => {
  let service: GeminiResumeNormalizerService;

  beforeEach(() => {
    service = new GeminiResumeNormalizerService();
  });

  it('normalizes Gemini JSON into the shared ParsedResume shape', () => {
    const result = service.normalize({
      profile: {
        fullName: ' Nguyen Minh Khoa ',
        contactEmail: 'khoa@nexhire.vn',
      },
      skills: [
        { name: 'NestJS', level: 'advanced', yearsOfExperience: '3' },
        { name: 'nestjs' },
        'PostgreSQL',
      ],
      experiences: [
        {
          companyName: 'NexHire',
          position: 'Backend Engineer',
          startMonth: 13,
          startYear: '2024',
          isCurrent: true,
        },
      ],
      educations: [{ schoolName: 'HCMUT', endYear: '2025' }],
      certifications: [{ name: 'AWS SAA', issuedYear: '2026' }],
      projects: [{ name: 'CV Matching', technologies: ['NestJS', 123, 'PostgreSQL'] }],
    });

    expect(result.profile.fullName).toBe('Nguyen Minh Khoa');
    expect(result.skills).toEqual([
      { name: 'NestJS', level: 'advanced', yearsOfExperience: 3 },
      { name: 'PostgreSQL', level: undefined, yearsOfExperience: undefined },
    ]);
    expect(result.experiences[0]).toMatchObject({
      companyName: 'NexHire',
      position: 'Backend Engineer',
      startMonth: undefined,
      startYear: 2024,
      isCurrent: true,
    });
    expect(result.educations[0].endYear).toBe(2025);
    expect(result.certifications[0].issuedYear).toBe(2026);
    expect(result.projects[0].technologies).toEqual(['NestJS', 'PostgreSQL']);
  });
});
