import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { setupApp } from '@nexhire/shared';
import { ApplicationController, ApplicationInternalController } from '../application.controller';
import { RecruiterApplicationController } from '../recruiter-application.controller';
import { RecruiterCandidateController } from '../recruiter-candidate.controller';
import { ApplicationService } from '../application.service';

describe('Application Swagger startup (no infrastructure)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('starts with Swagger enabled and documents nullable match snapshot fields', async () => {
    const module = await Test.createTestingModule({
      controllers: [
        ApplicationController,
        ApplicationInternalController,
        RecruiterApplicationController,
        RecruiterCandidateController,
      ],
      providers: [
        { provide: ApplicationService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    app = module.createNestApplication();
    setupApp(app, { serviceName: 'application-swagger-test', swagger: true });
    await app.init();
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    expect(document.components?.schemas?.UpdateApplicationMatchSnapshotDto).toMatchObject({
      required: expect.arrayContaining(['scoringStatus', 'matchScore', 'matchLevel']),
      properties: {
        matchScore: {
          type: 'number',
          nullable: true,
          example: null,
          description: expect.stringContaining('numeric values are rejected'),
        },
        matchLevel: {
          type: 'string',
          nullable: true,
          example: null,
          description: expect.stringContaining('string values are rejected'),
        },
      },
    });
  });
});
