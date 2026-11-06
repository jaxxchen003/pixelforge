import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  websiteConfig: {
    cache: { enable: true, provider: 'kv' as 'kv' },
  },
  kv: undefined as KvStub | undefined,
  warn: vi.fn(),
}));

type KvStub = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

vi.mock('@/config/website', () => ({ websiteConfig: mocks.websiteConfig }));
vi.mock('@/lib/observability', () => ({
  logOperationalEvent: {
    log: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: mocks.warn,
    error: vi.fn(),
  },
}));
vi.mock('cloudflare:workers', () => ({
  get env() {
    return { CACHE: mocks.kv };
  },
}));

function createKv(): KvStub {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => {
      const value = store.get(key);
      return value === undefined ? null : JSON.parse(value);
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async () => ({ keys: [], list_complete: true })),
  };
}

/**
 * The cache module memoizes its provider in module scope, so each test needs a
 * fresh module graph to pick up a changed config or binding.
 */
async function loadCache() {
  vi.resetModules();
  return import('@/cache');
}

beforeEach(() => {
  mocks.websiteConfig.cache = { enable: true, provider: 'kv' };
  mocks.kv = createKv();
  mocks.warn.mockReset();
});

describe('getOrSetCache', () => {
  test('calls the fetcher and stores its value on a miss', async () => {
    const { getOrSetCache } = await loadCache();
    const fetcher = vi.fn().mockResolvedValue({ subscribed: true });

    const value = await getOrSetCache({
      key: 'app-cache:v1:test',
      ttlSeconds: 600,
      fetcher,
    });

    expect(value).toEqual({ subscribed: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mocks.kv?.put).toHaveBeenCalledWith(
      'app-cache:v1:test',
      JSON.stringify({ subscribed: true }),
      { expirationTtl: 600 }
    );
  });

  test('returns the cached value without calling the fetcher', async () => {
    const { getOrSetCache } = await loadCache();
    mocks.kv?.get.mockResolvedValueOnce({ subscribed: false });
    const fetcher = vi.fn();

    const value = await getOrSetCache({
      key: 'app-cache:v1:test',
      ttlSeconds: 600,
      fetcher,
    });

    expect(value).toEqual({ subscribed: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test('falls back to the fetcher when the cache read throws', async () => {
    const { getOrSetCache } = await loadCache();
    mocks.kv?.get.mockRejectedValueOnce(new Error('kv unavailable'));
    const fetcher = vi.fn().mockResolvedValue('fresh');

    await expect(
      getOrSetCache({ key: 'k', ttlSeconds: 600, fetcher })
    ).resolves.toBe('fresh');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalledWith('[cache] read failed', 'k');
  });

  test('returns the value even when the cache write throws', async () => {
    const { getOrSetCache } = await loadCache();
    mocks.kv?.put.mockRejectedValueOnce(new Error('kv write failed'));
    const fetcher = vi.fn().mockResolvedValue('fresh');

    await expect(
      getOrSetCache({ key: 'k', ttlSeconds: 600, fetcher })
    ).resolves.toBe('fresh');
    expect(mocks.warn).toHaveBeenCalledWith('[cache] write failed', 'k');
  });

  test('propagates a fetcher error and caches nothing', async () => {
    const { getOrSetCache } = await loadCache();
    const fetcher = vi.fn().mockRejectedValue(new Error('provider down'));

    await expect(
      getOrSetCache({ key: 'k', ttlSeconds: 600, fetcher })
    ).rejects.toThrow('provider down');
    expect(mocks.kv?.put).not.toHaveBeenCalled();
  });

  test('caches falsy values as-is', async () => {
    const { getOrSetCache } = await loadCache();
    const fetcher = vi.fn().mockResolvedValue(false);

    await expect(
      getOrSetCache({ key: 'k', ttlSeconds: 600, fetcher })
    ).resolves.toBe(false);
    expect(mocks.kv?.put).toHaveBeenCalledWith('k', 'false', {
      expirationTtl: 600,
    });
  });

  test('treats a stored null as a miss and refetches', async () => {
    const { getOrSetCache } = await loadCache();
    mocks.kv?.get.mockResolvedValueOnce(null);
    const fetcher = vi.fn().mockResolvedValue('fresh');

    await expect(
      getOrSetCache({ key: 'k', ttlSeconds: 600, fetcher })
    ).resolves.toBe('fresh');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('clamps the TTL to the KV minimum', async () => {
    const { getOrSetCache } = await loadCache();

    await getOrSetCache({
      key: 'k',
      ttlSeconds: 5,
      fetcher: async () => 'v',
    });

    expect(mocks.kv?.put).toHaveBeenCalledWith('k', '"v"', {
      expirationTtl: 60,
    });
  });

  test('bypasses the cache entirely when the feature is disabled', async () => {
    mocks.websiteConfig.cache = { enable: false, provider: 'kv' };
    const { getOrSetCache } = await loadCache();
    const fetcher = vi.fn().mockResolvedValue('fresh');

    await expect(
      getOrSetCache({ key: 'k', ttlSeconds: 600, fetcher })
    ).resolves.toBe('fresh');
    expect(mocks.kv?.get).not.toHaveBeenCalled();
    expect(mocks.kv?.put).not.toHaveBeenCalled();
  });

  test('still fetches when the CACHE binding is absent', async () => {
    mocks.kv = undefined;
    const { getOrSetCache } = await loadCache();
    const fetcher = vi.fn().mockResolvedValue('fresh');

    await expect(
      getOrSetCache({ key: 'k', ttlSeconds: 600, fetcher })
    ).resolves.toBe('fresh');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('delete helpers', () => {
  test('deleteCache removes one key', async () => {
    const { deleteCache } = await loadCache();

    await deleteCache('app-cache:v1:one');

    expect(mocks.kv?.delete).toHaveBeenCalledWith('app-cache:v1:one');
  });

  test('deleteCache logs and swallows a failure', async () => {
    const { deleteCache } = await loadCache();
    mocks.kv?.delete.mockRejectedValueOnce(new Error('kv down'));

    await expect(deleteCache('k')).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledWith('[cache] delete failed', 'k');
  });

  test('deleteCacheByPrefix pages through every key', async () => {
    const { deleteCacheByPrefix } = await loadCache();
    mocks.kv?.list
      .mockResolvedValueOnce({
        keys: [{ name: 'p:1' }, { name: 'p:2' }],
        list_complete: false,
        cursor: 'next',
      })
      .mockResolvedValueOnce({
        keys: [{ name: 'p:3' }],
        list_complete: true,
      });

    await deleteCacheByPrefix('p:');

    expect(mocks.kv?.list).toHaveBeenCalledTimes(2);
    expect(mocks.kv?.list).toHaveBeenLastCalledWith({
      prefix: 'p:',
      cursor: 'next',
    });
    expect(mocks.kv?.delete.mock.calls.map(([key]) => key).sort()).toEqual([
      'p:1',
      'p:2',
      'p:3',
    ]);
  });

  test('deleteCacheByPrefix logs and swallows a failure', async () => {
    const { deleteCacheByPrefix } = await loadCache();
    mocks.kv?.list.mockRejectedValueOnce(new Error('kv down'));

    await expect(deleteCacheByPrefix('p:')).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledWith(
      '[cache] delete by prefix failed',
      'p:'
    );
  });

  test('delete helpers do nothing when the feature is disabled', async () => {
    mocks.websiteConfig.cache = { enable: false, provider: 'kv' };
    const { deleteCache, deleteCacheByPrefix } = await loadCache();

    await deleteCache('k');
    await deleteCacheByPrefix('p:');

    expect(mocks.kv?.delete).not.toHaveBeenCalled();
    expect(mocks.kv?.list).not.toHaveBeenCalled();
  });
});

describe('provider registry', () => {
  test('memoizes the provider instance', async () => {
    const { getCacheProvider } = await loadCache();

    expect(getCacheProvider()).toBe(getCacheProvider());
    expect(getCacheProvider()?.getProviderName()).toBe('kv');
  });

  test('returns null when the cache is disabled', async () => {
    mocks.websiteConfig.cache = { enable: false, provider: 'kv' };
    const { getCacheProvider } = await loadCache();

    expect(getCacheProvider()).toBeNull();
  });

  test('rejects a provider name outside the registry', async () => {
    mocks.websiteConfig.cache = { enable: true, provider: 'redis' as 'kv' };
    const { getCacheProvider } = await loadCache();

    expect(() => getCacheProvider()).toThrow(
      'Unsupported cache provider: redis.'
    );
  });
});

describe('createCacheKey', () => {
  test('omits the hash when no parts are given', async () => {
    const { createCacheKey } = await loadCache();

    expect(createCacheKey('newsletter:status')).toBe(
      'app-cache:v1:newsletter:status'
    );
  });

  test('is stable for object key order', async () => {
    const { createCacheKey } = await loadCache();

    expect(createCacheKey('scope', { a: 1, b: 2 })).toBe(
      createCacheKey('scope', { b: 2, a: 1 })
    );
  });

  test('differs for different parts', async () => {
    const { createCacheKey } = await loadCache();

    expect(createCacheKey('scope', 'a@example.test')).not.toBe(
      createCacheKey('scope', 'b@example.test')
    );
  });

  test('never embeds the raw value', async () => {
    const { createCacheKey } = await loadCache();

    expect(createCacheKey('scope', 'private@example.test')).not.toContain(
      'private@example.test'
    );
  });

  test('normalizes dates and sorts nested object keys', async () => {
    const { createCacheKey } = await loadCache();
    const a = createCacheKey('scope', {
      at: new Date('2026-01-01T00:00:00.000Z'),
      nested: { z: 1, a: 2 },
    });
    const b = createCacheKey('scope', {
      nested: { a: 2, z: 1 },
      at: '2026-01-01T00:00:00.000Z',
    });

    expect(a).toBe(b);
  });

  test('distinguishes arrays from scalars', async () => {
    const { createCacheKey } = await loadCache();

    expect(createCacheKey('scope', [1, 2])).not.toBe(
      createCacheKey('scope', '1,2')
    );
  });
});
