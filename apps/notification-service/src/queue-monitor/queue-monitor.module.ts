import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { QueueMonitorService } from './queue-monitor.service';

@Module({
  imports: [HttpModule],
  providers: [QueueMonitorService],
})
export class QueueMonitorModule {}
