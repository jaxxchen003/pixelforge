import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  websiteConfig: {
    metadata: {
      name: 'TanStarter',
      images: { logoLight: '/logo.png' },
    },
    notification: { enable: true, provider: 'discord' as 'discord' | 'feishu' },
  },
  serverEnv: {} as {
    DISCORD_WEBHOOK_URL?: string;
    FEISHU_WEBHOOK_URL?: string;
  },
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/config/website', () => ({ websiteConfig: mocks.websiteConfig }));
vi.mock('@/env/server', () => ({ serverEnv: mocks.serverEnv }));
vi.mock('@/lib/urls', () => ({
  getBaseUrl: () => 'https://example.test',
}));
vi.mock('@/lib/observability', () => ({
  logOperationalEvent: {
    log: mocks.log,
    info: mocks.log,
    debug: mocks.log,
    warn: mocks.warn,
    error: mocks.error,
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { DiscordProvider } from '@/notification/provider/discord';
import { FeishuProvider } from '@/notification/provider/feishu';

const DISCORD_WEBHOOK = 'https://discord.test/api/webhooks/1/token';
const FEISHU_WEBHOOK = 'https://feishu.test/open-apis/bot/v2/hook/1';

const payment = {
  sessionId: 'cs_test_123',
  customerId: 'cus_test_456',
  userName: 'Ada Lovelace',
  amount: 129.5,
};

function okResponse() {
  return new Response(null, { status: 204 });
}

beforeEach(() => {
  mocks.serverEnv.DISCORD_WEBHOOK_URL = DISCORD_WEBHOOK;
  mocks.serverEnv.FEISHU_WEBHOOK_URL = FEISHU_WEBHOOK;
  mocks.websiteConfig.notification = { enable: true, provider: 'discord' };
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(okResponse());
});

describe('Discord payment notification', () => {
  test('posts an embed describing the purchase to the configured webhook', async () => {
    const provider = new DiscordProvider();

    await provider.sendPaymentNotification(payment);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(DISCORD_WEBHOOK);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const body = JSON.parse(init.body);
    expect(body.username).toBe('TanStarter');
    expect(body.avatar_url).toBe('https://example.test/logo.png');
    expect(body.embeds).toHaveLength(1);

    const [embed] = body.embeds;
    expect(embed.title).toBe('🎉 New Purchase');
    expect(embed.fields).toEqual([
      { name: 'Username', value: 'Ada Lovelace', inline: true },
      { name: 'Amount', value: '$129.50', inline: true },
      { name: 'Customer ID', value: '`cus_test_456`', inline: false },
      { name: 'Session ID', value: '`cs_test_123`', inline: false },
    ]);
    expect(Number.isNaN(Date.parse(embed.timestamp))).toBe(false);
  });

  test('omits the avatar when the site has no logo', async () => {
    const logo = mocks.websiteConfig.metadata.images.logoLight;
    mocks.websiteConfig.metadata.images.logoLight = '';
    try {
      await new DiscordProvider().sendPaymentNotification(payment);

      expect(JSON.parse(fetchMock.mock.calls[0][1].body).avatar_url).toBe(
        undefined
      );
    } finally {
      mocks.websiteConfig.metadata.images.logoLight = logo;
    }
  });

  test('logs but does not throw when Discord rejects the message', async () => {
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));

    await expect(
      new DiscordProvider().sendPaymentNotification(payment)
    ).resolves.toBeUndefined();
    expect(mocks.error).toHaveBeenCalledWith(
      'Failed to send Discord message:',
      expect.any(String)
    );
    expect(mocks.log).not.toHaveBeenCalled();
  });

  test('swallows a network failure so the payment webhook keeps succeeding', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));

    await expect(
      new DiscordProvider().sendPaymentNotification(payment)
    ).resolves.toBeUndefined();
    expect(mocks.error).toHaveBeenCalledWith(
      'Failed to send Discord notification:',
      expect.any(Error)
    );
  });

  test('logs success only when the webhook accepts the message', async () => {
    await new DiscordProvider().sendPaymentNotification(payment);

    expect(mocks.log).toHaveBeenCalledWith(
      'Successfully sent Discord notification for user Ada Lovelace'
    );
    expect(mocks.error).not.toHaveBeenCalled();
  });

  test('reports its provider name', () => {
    expect(new DiscordProvider().getProviderName()).toBe('discord');
  });

  test('throws from the constructor when the webhook URL is missing', () => {
    mocks.serverEnv.DISCORD_WEBHOOK_URL = undefined;

    expect(() => new DiscordProvider()).toThrow('DISCORD_WEBHOOK_URL');
  });
});

describe('Feishu payment notification', () => {
  test('posts a text message describing the purchase', async () => {
    const provider = new FeishuProvider();

    await provider.sendPaymentNotification(payment);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(FEISHU_WEBHOOK);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const body = JSON.parse(init.body);
    expect(body.msg_type).toBe('text');
    expect(body.content.text).toContain('Ada Lovelace');
    expect(body.content.text).toContain('$129.50');
    expect(body.content.text).toContain('cus_test_456');
    expect(body.content.text).toContain('cs_test_123');
  });

  test('logs but does not throw when Feishu rejects the message', async () => {
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }));

    await expect(
      new FeishuProvider().sendPaymentNotification(payment)
    ).resolves.toBeUndefined();
    expect(mocks.error).toHaveBeenCalledWith(
      'Failed to send Feishu message:',
      expect.any(String)
    );
    expect(mocks.log).not.toHaveBeenCalled();
  });

  test('swallows a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('dns failure'));

    await expect(
      new FeishuProvider().sendPaymentNotification(payment)
    ).resolves.toBeUndefined();
    expect(mocks.error).toHaveBeenCalledWith(
      'Failed to send Feishu notification:',
      expect.any(Error)
    );
  });

  test('reports its provider name', () => {
    expect(new FeishuProvider().getProviderName()).toBe('feishu');
  });

  test('throws from the constructor when the webhook URL is missing', () => {
    mocks.serverEnv.FEISHU_WEBHOOK_URL = undefined;

    expect(() => new FeishuProvider()).toThrow('FEISHU_WEBHOOK_URL');
  });
});

describe('notification module dispatch', () => {
  test('does nothing while notifications are disabled', async () => {
    vi.resetModules();
    mocks.websiteConfig.notification = { enable: false, provider: 'discord' };
    const { sendPaymentNotification } = await import('@/notification');

    await sendPaymentNotification(payment);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('routes to the provider named in the site config', async () => {
    vi.resetModules();
    mocks.websiteConfig.notification = { enable: true, provider: 'feishu' };
    const { sendPaymentNotification } = await import('@/notification');

    await sendPaymentNotification(payment);

    expect(fetchMock.mock.calls[0][0]).toBe(FEISHU_WEBHOOK);
  });

  test('reuses one provider instance across calls', async () => {
    vi.resetModules();
    mocks.websiteConfig.notification = { enable: true, provider: 'discord' };
    const { getNotificationProvider } = await import('@/notification');

    expect(getNotificationProvider()).toBe(getNotificationProvider());
  });

  test('rejects a provider name outside the registry', async () => {
    vi.resetModules();
    mocks.websiteConfig.notification = {
      enable: true,
      provider: 'slack' as 'discord',
    };
    const { getNotificationProvider } = await import('@/notification');

    expect(() => getNotificationProvider()).toThrow(
      'Unsupported notification provider: slack.'
    );
  });
});
