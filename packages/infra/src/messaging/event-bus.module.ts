import { Global, Module } from '@nestjs/common';
import { EventPublisher } from './event-publisher.service';

/**
 * RabbitMQ event bus. Import once in a service that publishes domain events:
 *   imports: [EventBusModule]
 * Requires `rabbitmqConfig` loaded in the service's ConfigModule.
 *
 * Consumers (subscribers) are implemented in the owning service using amqplib
 * channel consumers bound to the topic exchange (see 12-infrastructure-patterns).
 */
@Global()
@Module({
  providers: [EventPublisher],
  exports: [EventPublisher],
})
export class EventBusModule {}
