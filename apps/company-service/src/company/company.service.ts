import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CompanyStatus } from '@nexhire/shared';

import { Company } from './entities/company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyResponseDto } from './dto/company-response.dto';
import { CompanyMapper } from './company.mapper';
import { JobClient } from './job.client'; // Rule 12: Dùng Http client để gọi sang job-service

@Injectable()
export class CompanyService {
  // Rule 14 & 06: Dùng context logger thay cho console.log
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly jobClient: JobClient, // Rule 12: Inject Http client gọi sang job-service
  ) {}

  // 1. Dành cho Recruiter: Tạo công ty
  async create(userId: string, dto: CreateCompanyDto): Promise<CompanyResponseDto> {
    // 1 Recruiter thường chỉ có 1 công ty
    const existing = await this.companyRepo.findOne({ where: { ownerId: userId } });
    if (existing) {
      throw new ConflictException('You already have a company profile');
    }

    // Check trùng mã số thuế
    const taxExist = await this.companyRepo.findOne({ where: { taxCode: dto.taxCode } });
    if (taxExist) {
      throw new ConflictException('Tax code already in use');
    }

    const company = this.companyRepo.create({
      ...dto,
      ownerId: userId,
      status: CompanyStatus.PENDING,
    });
    
    const saved = await this.companyRepo.save(company);
    this.logger.log(`Company created with ID: ${saved.id} by user: ${userId}`);

    // Rule 07: Map qua DTO trước khi trả về Controller
    return CompanyMapper.toResponse(saved); 
  }

  // 2. Dành cho Recruiter: Lấy profile công ty của chính mình
  async findByOwner(userId: string): Promise<CompanyResponseDto> {
    const company = await this.companyRepo.findOne({ where: { ownerId: userId } });
    if (!company) {
      throw new NotFoundException('Company profile not found');
    }
    return CompanyMapper.toResponse(company);
  }

  // 3. Dành cho Recruiter: Cập nhật thông tin
  async update(companyId: string, userId: string, dto: UpdateCompanyDto): Promise<CompanyResponseDto> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }
    
    // Rule 11: Ownership check - Chỉ chủ mới được sửa
    if (company.ownerId !== userId) {
      throw new ForbiddenException('You can only update your own company');
    }

    // Nếu thay đổi mã số thuế, cần check trùng lặp
    if (dto.taxCode && dto.taxCode !== company.taxCode) {
      const taxExist = await this.companyRepo.findOne({ where: { taxCode: dto.taxCode } });
      if (taxExist) {
        throw new ConflictException('Tax code already in use');
      }
    }

    // Nếu sửa thông tin quan trọng (Tên hoặc MST), đưa trạng thái về PENDING chờ Admin duyệt lại
    if (dto.taxCode || dto.name) {
      company.status = CompanyStatus.PENDING;
      this.logger.log(`Company ${companyId} status reverted to PENDING due to major updates`);
    }

    Object.assign(company, dto);
    const updated = await this.companyRepo.save(company);

    return CompanyMapper.toResponse(updated);
  }

  // 4. Dành cho Admin: Lấy danh sách chờ duyệt
  async getPending(): Promise<CompanyResponseDto[]> {
    const companies = await this.companyRepo.find({
      where: { status: CompanyStatus.PENDING },
      order: { createdAt: 'DESC' }, // Hiển thị công ty tạo mới nhất lên đầu
    });
    
    return companies.map(CompanyMapper.toResponse);
  }

  // 5. Dành cho Admin: Duyệt công ty
  async verify(companyId: string, action: 'APPROVE' | 'REJECT'): Promise<CompanyResponseDto> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    company.status = action === 'APPROVE' ? CompanyStatus.APPROVED : CompanyStatus.REJECTED;
    const saved = await this.companyRepo.save(company);
    
    this.logger.log(`Company ${companyId} has been ${action}D`);
    
    return CompanyMapper.toResponse(saved);
  }

  // 6. Dành cho Public: Xem thông tin công ty và Job
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getPublicProfileWithJobs(companyId: string): Promise<CompanyResponseDto & { activeJobs: any[] }> {
    const company = await this.companyRepo.findOne({ 
      where: { id: companyId, status: CompanyStatus.APPROVED } 
    });
    
    if (!company) {
      throw new NotFoundException('Company not found or not yet approved');
    }

    // Gọi HTTP sang job-service lấy danh sách job (jobClient sẽ tự catch error nếu lỗi)
    const activeJobs = await this.jobClient.getActiveJobsByCompany(companyId);

    const companyRes = CompanyMapper.toResponse(company);
    
    return {
      ...companyRes,
      activeJobs,
    };
  }
}
