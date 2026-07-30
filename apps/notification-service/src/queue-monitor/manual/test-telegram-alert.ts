import * as dotenv from 'dotenv';
import { formatQueueMonitorAlert } from '../templates/queue-monitor-alert.template';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const threshold = process.env.QUEUE_MONITOR_ALERT_THRESHOLD ?? '100';
const queueName = process.env.QUEUE_MONITOR_TEST_QUEUE ?? 'cv-parsing.cv-uploaded';
const vhost = process.env.RABBITMQ_MANAGEMENT_VHOST ?? '/';
const managementUrl =
  process.env.RABBITMQ_MANAGEMENT_URL ?? process.env.RABBITMQ_HTTP_URL ?? 'http://localhost:15672';
const intervalMs = Number(process.env.QUEUE_MONITOR_INTERVAL_MS ?? '60000');
const cooldownMs = Number(process.env.QUEUE_MONITOR_ALERT_COOLDOWN_MS ?? '900000');

async function sendTelegramMessage(text: string): Promise<void> {
  if (!botToken || !chatId) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  const body = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || !body.ok) {
    throw new Error(body.description ?? `Telegram API failed status=${response.status}`);
  }
}

async function main(): Promise<void> {
  console.log('NexHire queue monitor Telegram alert test');
  console.log(`Queue: ${queueName}`);
  console.log(`Threshold: ${threshold}`);
  console.log(`Chat ID: ${chatId ?? '(missing)'}`);
  console.log('');
  console.log('Step 1: sending simulated backlog alert...');

  await sendTelegramMessage(
    formatQueueMonitorAlert({
      queue: {
        name: queueName,
        messages: Number(threshold) + 25,
        messages_ready: Number(threshold) + 20,
        messages_unacknowledged: 5,
        consumers: 1,
      },
      state: 'backlog',
      threshold: Number(threshold),
      intervalMs,
      cooldownMs,
      vhost,
      managementUrl,
      extraNote: 'This is a manual test message from notification-service.',
    }),
  );

  console.log('Step 2: sending simulated recovery alert...');

  await sendTelegramMessage(
    formatQueueMonitorAlert({
      queue: {
        name: queueName,
        messages: 0,
        messages_ready: 0,
        messages_unacknowledged: 0,
        consumers: 1,
      },
      state: 'recovered',
      threshold: Number(threshold),
      intervalMs,
      cooldownMs,
      vhost,
      managementUrl,
      extraNote: 'This is a manual test message from notification-service.',
    }),
  );

  console.log('');
  console.log('Done. Check the Telegram alert group for both messages.');
}

main().catch((error: unknown) => {
  console.error(`Telegram alert test failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
