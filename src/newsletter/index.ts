import { websiteConfig } from '@/config/website';
import { ResendNewsletterProvider } from './provider/resend';
import { BeehiivNewsletterProvider } from './provider/beehiiv';
import { MailCheapNewsletterProvider } from './provider/mailcheap';
import type { NewsletterProvider, NewsletterProviderName } from './types';

let newsletterProvider: NewsletterProvider | null = null;

type ProviderFactory = () => NewsletterProvider;

const providerRegistry: Record<NewsletterProviderName, ProviderFactory> = {
  resend: () => new ResendNewsletterProvider(),
  beehiiv: () => new BeehiivNewsletterProvider(),
  mailcheap: () => new MailCheapNewsletterProvider(),
};

function createProvider(): NewsletterProvider {
  const config = websiteConfig.newsletter;
  if (!config?.enable || !config?.provider) {
    throw new Error('Newsletter is disabled or provider not set.');
  }
  const name = config.provider;
  const factory = providerRegistry[name];
  if (!factory) {
    throw new Error(`Unsupported newsletter provider: ${name}.`);
  }
  return factory();
}

export function getNewsletterProvider(): NewsletterProvider {
  if (!newsletterProvider) newsletterProvider = createProvider();
  return newsletterProvider;
}

/**
 * Local E2E runs without provider credentials, so subscriptions are tracked in
 * process memory instead of contacting an external service. This keeps the
 * subscribe/unsubscribe journey testable without a live provider.
 */
const localE2ESubscriptions = new Set<string>();

function isLocalE2EMode(): boolean {
  return import.meta.env.DEV && import.meta.env.MODE === 'e2e';
}

export async function subscribe(email: string): Promise<boolean> {
  if (!websiteConfig.newsletter?.enable) return false;
  if (isLocalE2EMode()) {
    localE2ESubscriptions.add(email.trim().toLowerCase());
    return true;
  }
  const provider = getNewsletterProvider();
  return provider.subscribe({ email });
}

export async function unsubscribe(email: string): Promise<boolean> {
  if (!websiteConfig.newsletter?.enable) return false;
  if (isLocalE2EMode()) {
    localE2ESubscriptions.delete(email.trim().toLowerCase());
    return true;
  }
  const provider = getNewsletterProvider();
  return provider.unsubscribe({ email });
}

export async function isSubscribed(email: string): Promise<boolean> {
  if (!websiteConfig.newsletter?.enable) return false;
  if (isLocalE2EMode()) {
    return localE2ESubscriptions.has(email.trim().toLowerCase());
  }
  const provider = getNewsletterProvider();
  return provider.checkSubscribeStatus({ email });
}
