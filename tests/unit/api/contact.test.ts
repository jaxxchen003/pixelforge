import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  websiteConfig: {
    mail: { supportEmail: 'support@example.test' as string | undefined },
  },
  sendEmail: vi.fn(),
  messages: {
    contact_name_min: () => 'name too short',
    contact_name_max: () => 'name too long',
    contact_email_invalid: () => 'invalid email',
    contact_message_min: () => 'message too short',
    contact_message_max: () => 'message too long',
  },
}));

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const builder = {
      validator: () => builder,
      middleware: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock('@/config/website', () => ({ websiteConfig: mocks.websiteConfig }));
vi.mock('@/mail', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('@/locale/paraglide/messages', () => ({ m: mocks.messages }));

import { sendContactMessage } from '@/api/contact';

const send = sendContactMessage as unknown as (input: {
  data: { name: string; email: string; message: string };
}) => Promise<void>;

const valid = {
  name: 'Ada Lovelace',
  email: 'ada@example.test',
  message: 'I would like to ask about the pricing plans.',
};

beforeEach(() => {
  mocks.websiteConfig.mail.supportEmail = 'support@example.test';
  mocks.sendEmail.mockReset();
  mocks.sendEmail.mockResolvedValue({ success: true, messageId: 'msg_1' });
});

describe('contact message delivery', () => {
  test('sends the message to the configured support address', async () => {
    await send({ data: valid });

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledWith({
      to: 'support@example.test',
      template: 'contactMessage',
      context: {
        name: 'Ada Lovelace',
        email: 'ada@example.test',
        message: 'I would like to ask about the pricing plans.',
      },
    });
  });

  test('trims whitespace before sending', async () => {
    await send({
      data: {
        name: '  Ada Lovelace  ',
        email: '  ada@example.test  ',
        message: '  I would like to ask about the pricing plans.  ',
      },
    });

    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          name: 'Ada Lovelace',
          email: 'ada@example.test',
          message: 'I would like to ask about the pricing plans.',
        },
      })
    );
  });

  test('refuses to send when no support address is configured', async () => {
    mocks.websiteConfig.mail.supportEmail = undefined;

    await expect(send({ data: valid })).rejects.toThrow(
      'Contact form is not configured'
    );
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  test('surfaces a delivery failure to the caller', async () => {
    mocks.sendEmail.mockResolvedValue({
      success: false,
      error: 'provider rejected',
    });

    await expect(send({ data: valid })).rejects.toThrow(
      'Failed to send the message'
    );
  });

  test('does not leak the provider error message to the caller', async () => {
    mocks.sendEmail.mockResolvedValue({
      success: false,
      error: 'smtp: 550 mailbox full for ada@example.test',
    });

    await expect(send({ data: valid })).rejects.toThrow(
      'Failed to send the message'
    );
    await expect(send({ data: valid })).rejects.not.toThrow(
      /ada@example\.test/
    );
  });

  test('propagates a thrown sender error', async () => {
    mocks.sendEmail.mockRejectedValue(new Error('network down'));

    await expect(send({ data: valid })).rejects.toThrow('network down');
  });
});
