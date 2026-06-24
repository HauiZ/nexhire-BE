import { PaginationQueryDto } from './pagination-query.dto';

describe('PaginationQueryDto', () => {
  it('defaults to page 1, limit 20, skip 0', () => {
    const dto = new PaginationQueryDto();
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.skip).toBe(0);
  });

  it('computes skip from page and limit', () => {
    const dto = new PaginationQueryDto();
    dto.page = 3;
    dto.limit = 20;
    expect(dto.skip).toBe(40);
  });
});
