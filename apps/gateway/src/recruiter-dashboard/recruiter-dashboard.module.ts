import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { RecruiterDashboardController } from './recruiter-dashboard.controller';
import { RecruiterDashboardService } from './recruiter-dashboard.service';

@Module({
  imports: [HttpModule],
  controllers: [RecruiterDashboardController],
  providers: [RecruiterDashboardService],
})
export class RecruiterDashboardModule {}
