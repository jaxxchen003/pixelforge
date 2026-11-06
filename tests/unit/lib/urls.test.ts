import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientEnv: { VITE_BASE_URL: 'https://example.test' },
  websiteConfig: {
    metadata: {
      images: { ogImage: '/og.png' as string | undefined },
    },
  },
  locale: {
    current: 'en' as 'en' | 'zh',
  },
}));

vi.mock('@/env/client', () => ({ clientEnv: mocks.clientEnv }));
vi.mock('@/config/website', () => ({ websiteConfig: mocks.websiteConfig }));
vi.mock('@/lib/locale', () => ({
  getLocale: () => mocks.locale.current,
  localizeHref: (href: string, options?: { locale?: 'en' | 'zh' }) => {
    const locale = options?.locale ?? mocks.locale.current;
    return locale === 'en' ? href : `/zh${href === '/' ? '' : href}`;
  },
  deLocalizeHref: (href: string) =>
    href === '/zh' ? '/' : href.replace(/^\/zh(?=\/)/, ''),
}));

import {
  getBaseUrl,
  getCanonicalUrl,
  getCanonicalUrlForLocale,
  getFileAccessUrl,
  getImageUrl,
  getMailtoUrl,
  getOgImage,
  getPathWithLocale,
  getStripeCustomerDashboardUrl,
  isLinkActive,
  twitterHandleFromUrl,
} from '@/lib/urls';

beforeEach(() => {
  mocks.clientEnv.VITE_BASE_URL = 'https://example.test';
  mocks.websiteConfig.metadata.images.ogImage = '/og.png';
  mocks.locale.current = 'en';
});

describe('base and canonical URLs', () => {
  test('returns the configured origin', () => {
    expect(getBaseUrl()).toBe('https://example.test');
  });

  test('localizes a canonical path for the current locale', () => {
    mocks.locale.current = 'zh';

    expect(getCanonicalUrl('/about')).toBe('https://example.test/zh/about');
  });

  test('localizes a canonical path for an explicit locale', () => {
    expect(getCanonicalUrlForLocale('/about', 'en')).toBe(
      'https://example.test/about'
    );
    expect(getCanonicalUrlForLocale('/about', 'zh')).toBe(
      'https://example.test/zh/about'
    );
  });

  test('tolerates a trailing slash on the configured origin', () => {
    mocks.clientEnv.VITE_BASE_URL = 'https://example.test/';

    expect(getCanonicalUrl('/about')).toBe('https://example.test/about');
  });

  test('adds a leading slash when the path omits one', () => {
    expect(getCanonicalUrl('about')).toBe('https://example.test/about');
  });

  test('localizes the root path without doubling the slash', () => {
    mocks.locale.current = 'zh';

    expect(getCanonicalUrl('/')).toBe('https://example.test/zh');
  });
});

describe('getPathWithLocale', () => {
  test('strips an existing locale before applying the target one', () => {
    expect(getPathWithLocale('/zh/dashboard', 'en')).toBe('/dashboard');
    expect(getPathWithLocale('/dashboard', 'zh')).toBe('/zh/dashboard');
  });

  test('handles the localized root', () => {
    expect(getPathWithLocale('/zh', 'en')).toBe('/');
  });
});

describe('getImageUrl', () => {
  test.each([
    ['https://cdn.test/a.png', 'https://cdn.test/a.png'],
    ['http://cdn.test/a.png', 'http://cdn.test/a.png'],
    ['/local.png', 'https://example.test/local.png'],
    ['relative.png', 'https://example.test/relative.png'],
  ])('resolves %s', (input, expected) => {
    expect(getImageUrl(input)).toBe(expected);
  });
});

describe('getOgImage', () => {
  test('resolves the configured OG image', () => {
    expect(getOgImage()).toBe('https://example.test/og.png');
  });

  test('returns undefined when no OG image is configured', () => {
    mocks.websiteConfig.metadata.images.ogImage = undefined;

    expect(getOgImage()).toBeUndefined();
  });
});

describe('getStripeCustomerDashboardUrl', () => {
  test('links to the test dashboard in a dev build', () => {
    expect(import.meta.env.DEV).toBe(true);
    expect(getStripeCustomerDashboardUrl('cus_123')).toBe(
      'https://dashboard.stripe.com/test/customers/cus_123'
    );
  });
});

describe('getFileAccessUrl', () => {
  test('returns an empty string outside the browser', () => {
    expect(getFileAccessUrl('userfiles/u/1-note.txt')).toBe('');
  });

  test('encodes the key into the same-origin proxy URL in a browser', () => {
    const original = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'https://example.test' } },
      configurable: true,
    });
    try {
      expect(getFileAccessUrl('userfiles/u/1 note.txt')).toBe(
        'https://example.test/api/storage/file?key=userfiles%2Fu%2F1%20note.txt'
      );
    } finally {
      Object.defineProperty(globalThis, 'window', {
        value: original,
        configurable: true,
      });
    }
  });
});

describe('getMailtoUrl', () => {
  test.each([
    ['ada@example.test', 'mailto:ada@example.test'],
    ['  ada@example.test  ', 'mailto:ada@example.test'],
    ['Ada Lovelace <ada@example.test>', 'mailto:ada@example.test'],
    ['"Ada, Lovelace" <ada@example.test>', 'mailto:ada@example.test'],
  ])('converts %j', (input, expected) => {
    expect(getMailtoUrl(input)).toBe(expected);
  });

  test.each([
    [undefined],
    [null],
    [''],
    ['   '],
  ])('returns undefined for %j', (input) => {
    expect(getMailtoUrl(input)).toBeUndefined();
  });
});

describe('twitterHandleFromUrl', () => {
  test.each([
    ['https://twitter.com/Me', '@Me'],
    ['https://x.com/Me', '@Me'],
    ['https://twitter.com/Me/', '@Me'],
    ['https://x.com/Me/status/1', '@Me'],
  ])('extracts the handle from %s', (input, expected) => {
    expect(twitterHandleFromUrl(input)).toBe(expected);
  });

  test.each([
    ['https://example.com/Me'],
    ['https://twitter.com/'],
    ['not a url'],
  ])('returns null for %s', (input) => {
    expect(twitterHandleFromUrl(input)).toBeNull();
  });
});

describe('isLinkActive', () => {
  test.each([
    ['/about', '/about', true],
    ['/about', '/about/', true],
    ['/about/', '/about', true],
    ['/', '/', true],
    ['/about', '/pricing', false],
    ['/about', '/about/team', false],
  ])('isLinkActive(%j, %j) === %j', (href, pathname, expected) => {
    expect(isLinkActive(href, pathname)).toBe(expected);
  });

  test('never treats an anchor link as active', () => {
    expect(isLinkActive('/#features', '/')).toBe(false);
    expect(isLinkActive('/pricing#plans', '/pricing')).toBe(false);
  });

  test('returns false for a missing href', () => {
    expect(isLinkActive(undefined, '/about')).toBe(false);
  });
});
