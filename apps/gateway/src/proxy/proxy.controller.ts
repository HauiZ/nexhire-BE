import { All, Controller, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ProxyService } from './proxy.service';

/**
 * Catch-all routing to internal services by path prefix.
 * Add a handler per owned prefix as features are built.
 * (Routing rules live here; business logic lives in the target service.)
 */
@ApiExcludeController()
@Controller()
export class ProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @All('auth/*')
  auth(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('authService', req, res);
  }

  @All('users/*')
  users(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('authService', req, res);
  }

  @All('candidates/*')
  candidates(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('candidateService', req, res);
  }

  @All('companies/*')
  companies(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('companyService', req, res);
  }

  @All('hr-accounts/*')
  hrAccounts(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('companyService', req, res);
  }

  @All('jobs/*')
  jobs(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('jobService', req, res);
  }

  @All('categories/*')
  categories(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('jobService', req, res);
  }

  @All('cvs/*')
  cvs(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('candidateService', req, res);
  }

  @All('applications/*')
  applications(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('applicationService', req, res);
  }

  @All('saved-jobs/*')
  savedJobs(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('candidateService', req, res);
  }

  @All('cv-parsing/*')
  cvParsing(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('cvParsingService', req, res);
  }

  @All('matching/*')
  matching(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('matchingService', req, res);
  }

  @All('notifications/*')
  notifications(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('notificationService', req, res);
  }

  @All('documents/*')
  documents(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('documentStorageService', req, res);
  }
}

