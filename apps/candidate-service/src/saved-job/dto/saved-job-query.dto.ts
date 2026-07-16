import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class SavedJobBatchStatusQueryDto {
  @ApiProperty({
    description: 'Comma-separated job ids',
    example:
      '33333333-3333-3333-3333-333333333333,44444444-4444-4444-4444-444444444444',
  })
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value.flatMap((item) => String(item).split(','));
    }
    return String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  jobIds: string[];
}
