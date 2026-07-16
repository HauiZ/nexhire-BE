import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ApplicationClientService } from './application-client.service';

@Module({
  imports: [HttpModule],
  providers: [ApplicationClientService],
  exports: [ApplicationClientService],
})
export class ApplicationClientModule {}
