import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiManagementController } from './ai-management.controller';
import { AiManagementService } from './ai-management.service';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { AiSystemConfig } from './entities/ai-system-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AiSystemConfig, AiUsageLog])],
  controllers: [AiManagementController],
  providers: [AiManagementService],
  exports: [AiManagementService],
})
export class AiManagementModule {}
