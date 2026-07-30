export interface QueueAlertTemplateQueue {
  name: string;
  messages: number;
  messages_ready: number;
  messages_unacknowledged: number;
  consumers: number;
}

export type QueueAlertState = 'backlog' | 'recovered';

export interface QueueAlertTemplateOptions {
  queue: QueueAlertTemplateQueue;
  state: QueueAlertState;
  threshold: number;
  intervalMs: number;
  cooldownMs: number;
  vhost: string;
  managementUrl: string;
  checkedAt?: Date;
  extraNote?: string;
}

export const formatQueueMonitorAlert = ({
  queue,
  state,
  threshold,
  intervalMs,
  cooldownMs,
  vhost,
  managementUrl,
  checkedAt = new Date(),
  extraNote,
}: QueueAlertTemplateOptions): string => {
  const usagePercent = Math.round((queue.messages / threshold) * 100);
  const checkedAtText = checkedAt.toLocaleString('vi-VN', {
    timeZone: 'Asia/Bangkok',
    hour12: false,
  });

  if (state === 'recovered') {
    return [
      '✅ [NexHire] RabbitMQ queue recovered',
      '',
      `📦 Queue: ${queue.name}`,
      `🧭 VHost: ${vhost}`,
      `🕒 Checked at: ${checkedAtText} (Asia/Bangkok)`,
      '',
      `📊 Backlog: ${queue.messages}/${threshold} messages (${usagePercent}%)`,
      `🟢 Ready: ${queue.messages_ready}`,
      `🟡 Unacked: ${queue.messages_unacknowledged}`,
      `👥 Consumers: ${queue.consumers}`,
      '',
      '✅ Status: Queue is back below the alert threshold.',
      '👀 Action: No immediate action required. Keep watching if this queue flaps repeatedly.',
      extraNote ? ['', `📝 Note: ${extraNote}`].join('\n') : undefined,
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');
  }

  return [
    `${severityIcon(queue.messages, threshold)} [NexHire] RabbitMQ backlog alert`,
    '',
    `🚦 Severity: ${severity(queue.messages, threshold)}`,
    `📦 Queue: ${queue.name}`,
    `🧭 VHost: ${vhost}`,
    `🕒 Checked at: ${checkedAtText} (Asia/Bangkok)`,
    '',
    `📊 Backlog: ${queue.messages}/${threshold} messages (${usagePercent}%)`,
    `🟢 Ready: ${queue.messages_ready}`,
    `🟡 Unacked: ${queue.messages_unacknowledged}`,
    `👥 Consumers: ${queue.consumers}`,
    `⏱ Monitor interval: ${intervalMs}ms`,
    `🔁 Alert cooldown: ${cooldownMs}ms`,
    '',
    `🔎 RabbitMQ UI: ${rabbitQueueUrl(managementUrl, vhost, queue.name)}`,
    '',
    '🛠 Suggested checks:',
    '1. Confirm the consumer service is running and connected to RabbitMQ.',
    '2. Check consumer logs for repeated handler errors or retry loops.',
    '3. If this is a demo test queue, wait for the simulation cleanup/recovery alert.',
    extraNote ? ['', `📝 Note: ${extraNote}`].join('\n') : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
};

const severity = (messages: number, threshold: number): string => {
  if (messages >= threshold * 3) {
    return 'CRITICAL';
  }
  if (messages >= threshold * 2) {
    return 'HIGH';
  }
  return 'WARNING';
};

const severityIcon = (messages: number, threshold: number): string => {
  if (messages >= threshold * 3) {
    return '🚨';
  }
  if (messages >= threshold * 2) {
    return '🔥';
  }
  return '⚠️';
};

const rabbitQueueUrl = (managementUrl: string, vhost: string, queueName: string): string =>
  `${managementUrl}/#/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(queueName)}`;
