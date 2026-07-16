import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CompanyStatus, ERROR_CODES } from '@nexhire/shared';
import { Repository } from 'typeorm';
import { CompanyMapper } from './company.mapper';
import { CompanyResponseDto } from './dto/company-response.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { PublicCompanyProfileDto } from './dto/public-company-profile.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { VerifyAction } from './dto/verify-company.dto';
import { Company } from './entities/company.entity';

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {}

  async create(userId: string, dto: CreateCompanyDto): Promise<CompanyResponseDto> {
    const existing = await this.companyRepo.findOne({ where: { ownerId: userId } });
    if (existing) {
      throw new ConflictException({
        code: ERROR_CODES.COMPANY.ALREADY_EXISTS,
        message: 'You already have a company profile',
      });
    }

    const taxCode = this.normalizeTaxCode(dto.taxCode);
    const taxExists = await this.companyRepo.findOne({ where: { taxCode } });
    if (taxExists) {
      throw new ConflictException({
        code: ERROR_CODES.COMPANY.TAX_CODE_IN_USE,
        message: 'Tax code already in use',
      });
    }

    const company = this.companyRepo.create({
      ...dto,
      taxCode,
      ownerId: userId,
      status: CompanyStatus.PENDING,
    });

    const saved = await this.companyRepo.save(company);
    this.logger.log(`Company created companyId=${saved.id} ownerId=${userId}`);
    return CompanyMapper.toResponse(saved);
  }

  async findByOwner(userId: string): Promise<CompanyResponseDto> {
    const company = await this.companyRepo.findOne({ where: { ownerId: userId } });
    if (!company) {
      throw new NotFoundException({
        code: ERROR_CODES.COMPANY.NOT_FOUND,
        message: 'Company profile not found',
      });
    }
    return CompanyMapper.toResponse(company);
  }

  async update(
    companyId: string,
    userId: string,
    dto: UpdateCompanyDto,
  ): Promise<CompanyResponseDto> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException({
        code: ERROR_CODES.COMPANY.NOT_FOUND,
        message: `Company ${companyId} not found`,
      });
    }

    if (company.ownerId !== userId) {
      throw new ForbiddenException({
        code: ERROR_CODES.COMMON.FORBIDDEN,
        message: 'You can only update your own company',
      });
    }

    const patch = { ...dto };
    if (patch.taxCode !== undefined) {
      patch.taxCode = this.normalizeTaxCode(patch.taxCode);
      if (patch.taxCode !== company.taxCode) {
        const taxExists = await this.companyRepo.findOne({ where: { taxCode: patch.taxCode } });
        if (taxExists) {
          throw new ConflictException({
            code: ERROR_CODES.COMPANY.TAX_CODE_IN_USE,
            message: 'Tax code already in use',
          });
        }
      }
    }

    if (patch.taxCode !== undefined || patch.name !== undefined) {
      company.status = CompanyStatus.PENDING;
      this.logger.log(`Company status reset to PENDING companyId=${companyId}`);
    }

    Object.assign(company, patch);
    return CompanyMapper.toResponse(await this.companyRepo.save(company));
  }

  async getPending(): Promise<CompanyResponseDto[]> {
    const companies = await this.companyRepo.find({
      where: { status: CompanyStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
    return companies.map(CompanyMapper.toResponse);
  }

  async verify(companyId: string, action: VerifyAction): Promise<CompanyResponseDto> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException({
        code: ERROR_CODES.COMPANY.NOT_FOUND,
        message: `Company ${companyId} not found`,
      });
    }

    if (action === VerifyAction.APPROVE) {
      company.status = CompanyStatus.APPROVED;
    } else if (action === VerifyAction.REJECT) {
      company.status = CompanyStatus.REJECTED;
    } else {
      throw new BadRequestException({
        code: ERROR_CODES.COMPANY.INVALID_VERIFY_ACTION,
        message: 'Invalid verify action',
      });
    }

    const saved = await this.companyRepo.save(company);
    this.logger.log(`Company verified companyId=${companyId} action=${action}`);
    return CompanyMapper.toResponse(saved);
  }

  async getPublicProfile(companyId: string): Promise<PublicCompanyProfileDto> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId, status: CompanyStatus.APPROVED },
    });
    if (!company) {
      throw new NotFoundException({
        code: ERROR_CODES.COMPANY.NOT_FOUND,
        message: 'Company not found or not yet approved',
      });
    }

    return CompanyMapper.toPublicResponse(company);
  }

  private normalizeTaxCode(value: string): string {
    return value.trim();
  }
}
