import * as dotenv from 'dotenv';
import { connect } from 'amqplib';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const rabbitUrl = process.env.RABBITMQ_URL ?? 'amqp://nexhire:nexhire@localhost:5672';
const queueName = process.env.QUEUE_MONITOR_TEST_QUEUE ?? 'queue-monitor.test-backlog';
const threshold = Number(process.env.QUEUE_MONITOR_ALERT_THRESHOLD ?? '100');
const messageCount = Number(process.env.QUEUE_MONITOR_TEST_MESSAGE_COUNT ?? threshold + 25);
const cleanup = process.argv.includes('--cleanup');
const autoCleanup = !process.argv.includes('--no-cleanup');
const autoCleanupDelayMs = Number(process.env.QUEUE_MONITOR_TEST_AUTO_CLEANUP_DELAY_MS ?? '90000');
const deleteQueueDelayMs = Number(process.env.QUEUE_MONITOR_TEST_DELETE_QUEUE_DELAY_MS ?? '90000');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('NexHire RabbitMQ backlog simulation');
  console.log(`RabbitMQ: ${rabbitUrl}`);
  console.log(`Queue: ${queueName}`);
  console.log(`Threshold: ${threshold}`);
  console.log(`Message count: ${messageCount}`);
  console.log('');

  const connection = await connect(rabbitUrl);
  const channel = await connection.createConfirmChannel();

  try {
    await channel.assertQueue(queueName, { durable: true });

    if (cleanup) {
      const result = await channel.purgeQueue(queueName);
      console.log(`Purged queue=${queueName} messages=${result.messageCount}`);
      await channel.deleteQueue(queueName);
      console.log(`Deleted queue=${queueName}`);
      return;
    }

    for (let index = 1; index <= messageCount; index += 1) {
      channel.sendToQueue(
        queueName,
        Buffer.from(
          JSON.stringify({
            test: true,
            sequence: index,
            queueName,
            createdAt: new Date().toISOString(),
            note: 'Manual RabbitMQ backlog simulation for Telegram queue monitor.',
          }),
        ),
        {
          persistent: true,
          contentType: 'application/json',
        },
      );
    }

    await channel.waitForConfirms();
    console.log(`Published ${messageCount} persistent messages to ${queueName}.`);
    console.log('');
    console.log('Make sure notification-service is running and queue monitor is enabled.');
    console.log('In local/dev, the monitor watches this test queue automatically.');
    console.log(
      'For a fast demo, set QUEUE_MONITOR_INTERVAL_MS=5000 before starting notification-service.',
    );
    if (!autoCleanup) {
      console.log('Auto cleanup disabled. After the alert arrives, cleanup with:');
      console.log(
        `npx ts-node apps/notification-service/src/queue-monitor/manual/simulate-queue-backlog.ts --cleanup`,
      );
      return;
    }

    console.log('');
    console.log(`Auto cleanup enabled. Waiting ${autoCleanupDelayMs}ms before purging queue...`);
    await sleep(autoCleanupDelayMs);
    const result = await channel.purgeQueue(queueName);
    console.log(`Auto cleanup purged queue=${queueName} messages=${result.messageCount}`);
    console.log(
      `Waiting ${deleteQueueDelayMs}ms before deleting queue so the monitor can send recovered alert...`,
    );
    await sleep(deleteQueueDelayMs);
    await channel.deleteQueue(queueName);
    console.log(`Deleted queue=${queueName}`);
    console.log(
      'Use --no-cleanup only when you want to inspect the backlog manually in RabbitMQ UI.',
    );
  } finally {
    await channel.close();
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(`Queue backlog simulation failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
