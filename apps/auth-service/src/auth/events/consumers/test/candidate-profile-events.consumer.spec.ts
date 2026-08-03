import { ConfigService } from '@nestjs/config';
import { UserLanguage } from '@nexhire/shared';
import { Repository } from 'typeorm';
import { CandidateProfileEventsConsumer } from '../candidate-profile-events.consumer';
import { User } from '../../../entities/user.entity';

describe('CandidateProfileEventsConsumer', () => {
  it('syncs candidate name and phone into auth user snapshot', async () => {
    const userRepo = {
      update: jest.fn().mockResolvedValue(undefined),
    };
    const consumer = new CandidateProfileEventsConsumer(
      { get: jest.fn() } as unknown as ConfigService,
      userRepo as unknown as Repository<User>,
    );

    await (
      consumer as unknown as {
        syncUserSnapshot(payload: {
          candidateUserId: string;
          fullName: string | null;
          phone: string | null;
          language?: UserLanguage;
        }): Promise<void>;
      }
    ).syncUserSnapshot({
      candidateUserId: 'user-1',
      fullName: 'Nguyen Minh Khoa',
      phone: '0912345678',
      language: UserLanguage.EN,
    });

    expect(userRepo.update).toHaveBeenCalledWith('user-1', {
      fullName: 'Nguyen Minh Khoa',
      phone: '0912345678',
      language: UserLanguage.EN,
    });
  });
});
