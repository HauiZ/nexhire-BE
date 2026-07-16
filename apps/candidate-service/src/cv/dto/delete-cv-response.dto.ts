import { ApiProperty } from '@nestjs/swagger';

export class DeleteCvResponseDto {
  @ApiProperty()
  deleted: true;
}
