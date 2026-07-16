import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { DocumentClientService } from './document-client.service';

@Module({
  imports: [HttpModule],
  providers: [DocumentClientService],
  exports: [DocumentClientService],
})
export class DocumentClientModule {}
