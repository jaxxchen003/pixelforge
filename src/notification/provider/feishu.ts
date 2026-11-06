import { logOperationalEvent } from '@/lib/observability';
import { serverEnv } from '@/env/server';
import type {
  NotificationProvider,
  SendPaymentNotificationParams,
} from '../types';

/**
 * Send a message to Feishu via webhook.
 * @returns whether the webhook accepted the message
 */
async function sendMessage(
  webhookUrl: string,
  body: Record<string, unknown>
): Promise<boolean> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    logOperationalEvent.error(
      'Failed to send Feishu message:',
      response.statusText
    );
    return false;
  }
  return true;
}

export class FeishuProvider implements NotificationProvider {
  private webhookUrl: string;

  constructor() {
    const webhookUrl = serverEnv.FEISHU_WEBHOOK_URL;
    if (!webhookUrl) throw new Error('FEISHU_WEBHOOK_URL is required.');
    this.webhookUrl = webhookUrl;
  }

  getProviderName(): string {
    return 'feishu';
  }

  async sendPaymentNotification(
    params: SendPaymentNotificationParams
  ): Promise<void> {
    const { sessionId, customerId, userName, amount } = params;
    try {
      const accepted = await sendMessage(this.webhookUrl, {
        msg_type: 'text',
        content: {
          text: `🎉 New Purchase\nUsername: ${userName}\nAmount: $${amount.toFixed(2)}\nCustomer ID: ${customerId}\nSession ID: ${sessionId}`,
        },
      });
      if (!accepted) return;
      logOperationalEvent.log(
        `Successfully sent Feishu notification for user ${userName}`
      );
    } catch (error) {
      logOperationalEvent.error('Failed to send Feishu notification:', error);
    }
  }
}
