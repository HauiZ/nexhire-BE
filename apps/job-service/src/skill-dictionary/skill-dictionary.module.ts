import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DictionaryAudit,
  DictionaryName,
  DictionarySkill,
} from './entities/dictionary-skill.entity';
import { SkillDictionaryController } from './skill-dictionary.controller';
import { SkillDictionaryService } from './skill-dictionary.service';

@Module({
  imports: [TypeOrmModule.forFeature([DictionarySkill, DictionaryName, DictionaryAudit])],
  controllers: [SkillDictionaryController],
  providers: [SkillDictionaryService],
})
export class SkillDictionaryModule {}
