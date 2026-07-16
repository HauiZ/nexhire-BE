import { ApiProperty } from '@nestjs/swagger';

export class DeleteDocumentResponseDto {
  @ApiProperty()
  deleted: true;
}
