import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { MatchResult } from './entities/match-result.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MatchResult])],
  controllers: [MatchingController],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
