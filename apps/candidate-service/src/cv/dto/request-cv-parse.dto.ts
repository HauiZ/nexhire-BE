import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RequestCvParseDto {
  @ApiProperty()
  @IsUUID()
  requestedByUserId: string;
}
