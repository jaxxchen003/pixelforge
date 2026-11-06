import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getSession: vi.fn(),
  getFile: vi.fn(),
}));

// The route module only needs the handler out of createFileRoute, so a passthrough
// stub is enough and keeps the real router out of the unit test.
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}));
vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeaders: () => new Headers(),
}));
vi.mock('@/auth/auth', () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock('@/db', () => ({ getDb: mocks.getDb }));
vi.mock('@/storage', () => ({ getFile: mocks.getFile }));

import { ConfigurationError } from '@/storage/types';
import { Route } from '@/routes/api/storage/file';

const getHandler = (
  Route as unknown as {
    server: {
      handlers: { GET: (ctx: { request: Request }) => Promise<Response> };
    };
  }
).server.handlers.GET;

const PRIVATE_KEY = 'userfiles/user-a/abc-note.txt';
const FOREIGN_KEY = 'userfiles/user-b/def-secret.txt';
const PUBLIC_RECORD_KEY = 'userfiles/user-a/shared.png';
const PUBLIC_FOLDER_KEY = 'avatars/avatar-1.png';

type FileRow = { userId: string; isPublic: boolean | null };

/**
 * Minimal stand-in for the drizzle select chain used by the route:
 * `db.select(...).from(...).where(...).limit(1)` resolving to the matching row.
 */
function createDb(rows: Record<string, FileRow>) {
  return {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => ({
          limit: async () => {
            const key = (condition as { __key?: string }).__key ?? '';
            const row = rows[key];
            return row ? [row] : [];
          },
        }),
      }),
    }),
  };
}

// drizzle's eq() result is an opaque object; the stub above reads the key back
// off it, so replace eq with a tagged comparison for these tests.
vi.mock('drizzle-orm', async () => {
  const actual =
    await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    eq: (_column: unknown, value: unknown) => ({ __key: value }),
  };
});

function request(key: string | null) {
  const url = new URL('https://example.test/api/storage/file');
  if (key !== null) url.searchParams.set('key', key);
  return new Request(url);
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue(null);
  mocks.getFile.mockResolvedValue({
    body: new Blob(['file-body']).stream(),
    contentType: 'text/plain',
  });
});

describe('storage file route request validation', () => {
  test('rejects a missing key', async () => {
    const response = await getHandler({ request: request(null) });

    expect(response.status).toBe(400);
    expect(mocks.getFile).not.toHaveBeenCalled();
  });

  test('rejects a key containing a traversal segment', async () => {
    const response = await getHandler({ request: request('userfiles/../etc') });

    expect(response.status).toBe(400);
    expect(mocks.getFile).not.toHaveBeenCalled();
  });
});

describe('storage file route access control', () => {
  test('denies an anonymous read of a private file', async () => {
    mocks.getDb.mockReturnValue(
      createDb({ [PRIVATE_KEY]: { userId: 'user-a', isPublic: false } })
    );

    const response = await getHandler({ request: request(PRIVATE_KEY) });

    expect(response.status).toBe(403);
    expect(mocks.getFile).not.toHaveBeenCalled();
  });

  test('denies one user reading another user private file', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-a' } });
    mocks.getDb.mockReturnValue(
      createDb({ [FOREIGN_KEY]: { userId: 'user-b', isPublic: false } })
    );

    const response = await getHandler({ request: request(FOREIGN_KEY) });

    expect(response.status).toBe(403);
    expect(mocks.getFile).not.toHaveBeenCalled();
  });

  test('serves a private file to its owner with private caching', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-a' } });
    mocks.getDb.mockReturnValue(
      createDb({ [PRIVATE_KEY]: { userId: 'user-a', isPublic: false } })
    );

    const response = await getHandler({ request: request(PRIVATE_KEY) });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('file-body');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Disposition')).toBe('attachment');
  });

  test('serves a record flagged public without a session', async () => {
    mocks.getDb.mockReturnValue(
      createDb({ [PUBLIC_RECORD_KEY]: { userId: 'user-a', isPublic: true } })
    );

    const response = await getHandler({ request: request(PUBLIC_RECORD_KEY) });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable'
    );
  });

  test('serves a key in a public folder without a database record', async () => {
    mocks.getDb.mockReturnValue(createDb({}));

    const response = await getHandler({ request: request(PUBLIC_FOLDER_KEY) });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable'
    );
  });

  test('returns 404 for a key with no record outside public folders', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-a' } });
    mocks.getDb.mockReturnValue(createDb({}));

    const response = await getHandler({
      request: request('userfiles/user-a/orphan.txt'),
    });

    expect(response.status).toBe(404);
    expect(mocks.getFile).not.toHaveBeenCalled();
  });

  test('returns 404 when the object is missing from storage', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-a' } });
    mocks.getDb.mockReturnValue(
      createDb({ [PRIVATE_KEY]: { userId: 'user-a', isPublic: false } })
    );
    mocks.getFile.mockResolvedValue(null);

    const response = await getHandler({ request: request(PRIVATE_KEY) });

    expect(response.status).toBe(404);
  });
});

describe('storage file route response hardening', () => {
  test.each([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/x-icon',
    'application/pdf',
  ])('renders %s inline', async (contentType) => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-a' } });
    mocks.getDb.mockReturnValue(
      createDb({ [PRIVATE_KEY]: { userId: 'user-a', isPublic: false } })
    );
    mocks.getFile.mockResolvedValue({
      body: new Blob(['x']).stream(),
      contentType,
    });

    const response = await getHandler({ request: request(PRIVATE_KEY) });

    expect(response.headers.get('Content-Disposition')).toBeNull();
  });

  test.each([
    'text/html',
    'image/svg+xml',
    'application/octet-stream',
  ])('forces a download for %s', async (contentType) => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-a' } });
    mocks.getDb.mockReturnValue(
      createDb({ [PRIVATE_KEY]: { userId: 'user-a', isPublic: false } })
    );
    mocks.getFile.mockResolvedValue({
      body: new Blob(['<script>alert(1)</script>']).stream(),
      contentType,
    });

    const response = await getHandler({ request: request(PRIVATE_KEY) });

    expect(response.headers.get('Content-Disposition')).toBe('attachment');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  test('returns 503 when storage is not configured', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-a' } });
    mocks.getDb.mockReturnValue(
      createDb({ [PRIVATE_KEY]: { userId: 'user-a', isPublic: false } })
    );
    mocks.getFile.mockRejectedValue(
      new ConfigurationError('R2 bucket binding BUCKET is not configured.')
    );

    const response = await getHandler({ request: request(PRIVATE_KEY) });

    expect(response.status).toBe(503);
  });
});
