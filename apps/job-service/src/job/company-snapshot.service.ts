import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser, ERROR_CODES } from '@nexhire/shared';
import { CompanyStatusSnapshot, CompanyTrustLevel } from './entities/job.enum';

export interface CompanyPermissionSnapshot {
  companyId: string;
  companyName: string | null;
  companyStatus: CompanyStatusSnapshot;
  companyTrustLevel: CompanyTrustLevel;
  snapshotAt: Date;
}

@Injectable()
export class CompanySnapshotService {
  async getPostingSnapshot(user: AuthUser): Promise<CompanyPermissionSnapshot> {
    if (!user.companyId) {
      throw new ForbiddenException({
        code: ERROR_CODES.JOB.COMPANY_REQUIRED,
        message: 'Recruiter must belong to an approved company to post jobs',
      });
    }

    const snapshot: CompanyPermissionSnapshot = {
      companyId: user.companyId,
      companyName: null,
      companyStatus: CompanyStatusSnapshot.APPROVED,
      companyTrustLevel: CompanyTrustLevel.MEDIUM,
      snapshotAt: new Date(),
    };

    if (snapshot.companyStatus === CompanyStatusSnapshot.SUSPENDED) {
      throw new ForbiddenException({
        code: ERROR_CODES.JOB.COMPANY_SUSPENDED,
        message: 'Suspended companies cannot post jobs',
      });
    }

    if (snapshot.companyStatus !== CompanyStatusSnapshot.APPROVED) {
      throw new ForbiddenException({
        code: ERROR_CODES.JOB.COMPANY_NOT_APPROVED,
        message: 'Company must be approved before posting jobs',
      });
    }

    return snapshot;
  }
}
