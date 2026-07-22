import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '@nexhire/infra';
import { CategoryService } from '../category.service';
import { JobCategory } from '../entities/job-category.entity';

describe('CategoryService', () => {
  let service: CategoryService;
  let categoryRepo: { createQueryBuilder: jest.Mock };
  let redis: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    categoryRepo = {
      createQueryBuilder: jest.fn(),
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoryService,
        { provide: getRepositoryToken(JobCategory), useValue: categoryRepo },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = moduleRef.get(CategoryService);
  });

  it('lists active categories with published job counts', async () => {
    const qb = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Engineering',
          slug: 'engineering',
          description: 'Software engineering roles',
          activeJobCount: '12',
        },
      ]),
    };
    categoryRepo.createQueryBuilder.mockReturnValue(qb);
    const expected = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Engineering',
        slug: 'engineering',
        description: 'Software engineering roles',
        activeJobCount: 12,
      },
    ];
    redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify(expected));

    await expect(service.listPublic()).resolves.toEqual(expected);
    await expect(service.listPublic()).resolves.toEqual(expected);
    expect(categoryRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      'job:public-categories',
      JSON.stringify(expected),
      'EX',
      30,
    );
    expect(qb.where).toHaveBeenCalledWith('category.isActive = true');
  });
});
