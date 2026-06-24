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
    return this.proxy.forward('auth', req, res);
  }

  @All('users/*')
  users(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('auth', req, res);
  }

  @All('companies/*')
  companies(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('auth', req, res);
  }

  @All('jobs/*')
  jobs(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('job', req, res);
  }

  @All('cvs/*')
  cvs(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('cvApp', req, res);
  }

  @All('applications/*')
  applications(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('cvApp', req, res);
  }

  @All('ai/*')
  ai(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('ai', req, res);
  }
}
