import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationController } from './notification.controller';
import { NotificationEventsConsumer } from './notification-events.consumer';
import { Notification } from './entities/notification.entity';
import { NotificationService } from './notification.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationEventsConsumer],
  exports: [NotificationService],
})
export class NotificationModule {}
