import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateApplicationMatchSnapshotDto } from '../dto/application-input.dto';

describe('Internal match snapshot DTO', () => {
  it('accepts only the explicit null-score contract', async () => {
    expect(
      await validate(
        plainToInstance(UpdateApplicationMatchSnapshotDto, {
          scoringStatus: 'NOT_AVAILABLE',
          matchScore: null,
          matchLevel: null,
        }),
      ),
    ).toEqual([]);
  });
  it.each([
    {},
    { matchScore: null, matchLevel: null },
    { scoringStatus: 'NOT_AVAILABLE', matchScore: 0, matchLevel: null },
    { scoringStatus: 'NOT_AVAILABLE', matchScore: null },
    { scoringStatus: 'NOT_AVAILABLE', matchScore: '0', matchLevel: null },
    { scoringStatus: 'NOT_AVAILABLE', matchScore: null, matchLevel: 'HIGH' },
  ])('rejects missing/null ambiguity and numeric coercion %j', async (payload) => {
    expect(
      (await validate(plainToInstance(UpdateApplicationMatchSnapshotDto, payload))).length,
    ).toBeGreaterThan(0);
  });
});
