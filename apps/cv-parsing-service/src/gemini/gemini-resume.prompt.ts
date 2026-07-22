export function buildGeminiResumeParsePrompt(): string {
  return `
You are a resume parser for a recruitment platform.

Extract only information that is explicitly present in the attached CV/resume.
Return exactly one JSON object. Do not include markdown, explanations, comments, or extra text.

The JSON object must match this structure:
{
  "profile": {
    "fullName": "string or null",
    "phone": "string or null",
    "contactEmail": "string or null",
    "headline": "string or null",
    "summary": "string or null",
    "location": "string or null",
    "portfolioUrl": "string or null",
    "linkedinUrl": "string or null"
  },
  "skills": [
    {
      "name": "string",
      "level": "string or null",
      "yearsOfExperience": "number or null"
    }
  ],
  "experiences": [
    {
      "companyName": "string",
      "position": "string",
      "employmentType": "string or null",
      "startMonth": "number 1-12 or null",
      "startYear": "number or null",
      "endMonth": "number 1-12 or null",
      "endYear": "number or null",
      "isCurrent": "boolean or null",
      "description": "string or null"
    }
  ],
  "educations": [
    {
      "schoolName": "string",
      "degree": "string or null",
      "fieldOfStudy": "string or null",
      "startYear": "number or null",
      "endYear": "number or null",
      "isCurrent": "boolean or null",
      "description": "string or null"
    }
  ],
  "certifications": [
    {
      "name": "string",
      "issuer": "string or null",
      "credentialUrl": "string or null",
      "issuedYear": "number or null",
      "description": "string or null"
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string or null",
      "technologies": ["string"],
      "projectUrl": "string or null"
    }
  ]
}

Rules:
- Use null for missing scalar values and [] for missing arrays.
- Never invent names, emails, dates, skills, companies, or schools.
- Keep at most 40 skills and remove duplicates.
- Keep at most 8 experiences, 5 educations, 8 certifications, and 8 projects.
- Convert months to numbers when possible. If only a year is present, leave the month null.
- Descriptions must be concise, maximum 280 characters each.
- Escape all quotes and newlines inside string values.
`;
}
