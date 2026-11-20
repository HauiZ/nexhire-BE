import { ConfigService } from '@nestjs/config';
import { CompanyStatus } from '@nexhire/shared';
import { ChannelWrapper } from 'amqp-connection-manager';
import { ConsumeMessage } from 'amqplib';
import { QueryFailedError, Repository } from 'typeorm';
import {
  RECRUITER_COMPANY_LINK_USER_FK,
  RecruiterCompanyLink,
} from '../../entities/recruiter-company-link.entity';
import { CompanyLinkEventsConsumer } from './company-link-events.consumer';

describe('CompanyLinkEventsConsumer', () => {
  it('acknowledges an event whose Auth user has been physically deleted', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockRejectedValue(
        new QueryFailedError(
          'INSERT INTO recruiter_company_links',
          [],
          Object.assign(new Error('Foreign key violation'), {
            code: '23503',
            constraint: RECRUITER_COMPANY_LINK_USER_FK,
          }),
        ),
      ),
    };
    const consumer = new CompanyLinkEventsConsumer(
      new ConfigService(),
      repo as unknown as Repository<RecruiterCompanyLink>,
    );
    const channel = { ack: jest.fn(), nack: jest.fn() };
    consumer['channel'] = channel as unknown as ChannelWrapper;
    const message = {
      content: Buffer.from(
        JSON.stringify({
          ownerUserId: '06841441-cdcb-4dbd-86ae-07b92ee9bca0',
          companyId: '29b32d8c-d098-453d-84f4-1916ec87072d',
          companyStatus: CompanyStatus.APPROVED,
        }),
      ),
    } as ConsumeMessage;

    await consumer['consume'](message);

    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });
});
