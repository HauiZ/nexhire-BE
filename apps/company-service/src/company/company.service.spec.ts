import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CompanyStatus } from '@nexhire/shared';

import { CompanyService } from './company.service';
import { Company } from './entities/company.entity';
import { JobClient } from './job.client';
import { VerifyAction } from './dto/verify-company.dto';

describe('CompanyService', () => {
  let service: CompanyService;

  // Mock các dependencies
  const mockCompanyRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const mockJobClient = {
    getActiveJobsByCompany: jest.fn(),
  };

  // Dữ liệu mẫu dùng chung cho các test case
  const mockUserId = 'user-123';
  const mockCompanyId = 'company-123';

  const mockCompany = {
    id: mockCompanyId,
    name: 'NexHire Tech',
    taxCode: '0101234567',
    ownerId: mockUserId,
    status: CompanyStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Company;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyService,
        {
          provide: getRepositoryToken(Company),
          useValue: mockCompanyRepo,
        },
        {
          provide: JobClient,
          useValue: mockJobClient,
        },
      ],
    }).compile();

    service = module.get<CompanyService>(CompanyService);
  });

  afterEach(() => {
    jest.clearAllMocks(); // Xoá lịch sử gọi mock sau mỗi test
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create company', () => {
    it('should successfully create a company', async () => {
      mockCompanyRepo.findOne.mockResolvedValueOnce(null); // Chưa có công ty
      mockCompanyRepo.findOne.mockResolvedValueOnce(null); // Không trùng tax code
      mockCompanyRepo.create.mockReturnValue(mockCompany);
      mockCompanyRepo.save.mockResolvedValue(mockCompany);

      const result = await service.create(mockUserId, {
        name: 'NexHire Tech',
        taxCode: '0101234567',
      });

      expect(result.id).toEqual(mockCompanyId);
      expect(mockCompanyRepo.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if owner already has a company', async () => {
      mockCompanyRepo.findOne.mockResolvedValueOnce(mockCompany); // Đã có công ty

      await expect(service.create(mockUserId, { name: 'Test', taxCode: '111' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if taxCode is duplicated', async () => {
      mockCompanyRepo.findOne.mockResolvedValueOnce(null); // Qua bước check owner
      mockCompanyRepo.findOne.mockResolvedValueOnce(mockCompany); // Trùng tax code

      await expect(
        service.create(mockUserId, { name: 'Test', taxCode: '0101234567' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update company', () => {
    it('should throw ForbiddenException if user is not the owner', async () => {
      mockCompanyRepo.findOne.mockResolvedValueOnce(mockCompany);

      await expect(
        service.update(mockCompanyId, 'wrong-user-id', { name: 'New Name' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reset status to PENDING if taxCode is updated', async () => {
      mockCompanyRepo.findOne.mockResolvedValueOnce(mockCompany); // Tồn tại
      mockCompanyRepo.findOne.mockResolvedValueOnce(null); // Thuế mới không trùng

      // Clone object để test behavior thay đổi properties
      const updatedCompany = { ...mockCompany, status: CompanyStatus.PENDING };
      mockCompanyRepo.save.mockResolvedValue(updatedCompany);

      const result = await service.update(mockCompanyId, mockUserId, { taxCode: '999999' });

      expect(result.status).toEqual(CompanyStatus.PENDING);
      expect(mockCompanyRepo.save).toHaveBeenCalled();
    });
  });

  describe('verify company', () => {
    it('should approve a company successfully', async () => {
      mockCompanyRepo.findOne.mockResolvedValueOnce(mockCompany);

      const approvedCompany = { ...mockCompany, status: CompanyStatus.APPROVED };
      mockCompanyRepo.save.mockResolvedValue(approvedCompany);

      const result = await service.verify(mockCompanyId, VerifyAction.APPROVE);

      expect(result.status).toEqual(CompanyStatus.APPROVED);
    });

    it('should reject a company successfully', async () => {
      mockCompanyRepo.findOne.mockResolvedValueOnce(mockCompany);

      const rejectedCompany = { ...mockCompany, status: CompanyStatus.REJECTED };
      mockCompanyRepo.save.mockResolvedValue(rejectedCompany);

      const result = await service.verify(mockCompanyId, VerifyAction.REJECT);

      expect(result.status).toEqual(CompanyStatus.REJECTED);
    });

    it('should throw NotFoundException if company does not exist', async () => {
      mockCompanyRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.verify('invalid-id', VerifyAction.APPROVE)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getPublicProfile', () => {
    it('should return public profile', async () => {
      const approvedCompany = { ...mockCompany, status: CompanyStatus.APPROVED };
      mockCompanyRepo.findOne.mockResolvedValueOnce(approvedCompany);

      const result = await service.getPublicProfile(mockCompanyId);

      expect(result.name).toEqual('NexHire Tech');
      // Kiểm tra xem các field nhạy cảm đã bị ẩn chưa
      expect(result).not.toHaveProperty('taxCode');
    });

    it('should throw NotFoundException if company is not APPROVED', async () => {
      // Giả sử findOne trả về null vì query kèm điều kiện status = APPROVED
      mockCompanyRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.getPublicProfile(mockCompanyId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
