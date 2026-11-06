import { createClient } from '@libsql/client';
import { readdirSync, readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/libsql';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { user } from '@/db/auth.schema';

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

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
vi.mock('@/middlewares/admin-middleware', () => ({ adminApiMiddleware: {} }));
vi.mock('@/db', () => ({ getDb: mocks.getDb }));

import { listUsers } from '@/api/users';

const client = createClient({ url: ':memory:' });
const db = drizzle(client);

type ListUsersInput = {
  data: {
    pageIndex: number;
    pageSize: number;
    search: string;
    sortId: string;
    sortDesc: boolean;
    role?: string;
    status?: 'active' | 'inactive';
  };
};

const list = listUsers as unknown as (input: ListUsersInput) => Promise<{
  items: Array<{ id: string; email: string }>;
  total: number;
}>;

function query(overrides: Partial<ListUsersInput['data']> = {}) {
  return {
    data: {
      pageIndex: 0,
      pageSize: 50,
      search: '',
      sortId: 'createdAt',
      sortDesc: false,
      ...overrides,
    },
  };
}

const seeded = [
  {
    id: 'admin-active',
    name: 'Zoe Admin',
    email: 'zoe@example.test',
    role: 'admin',
    banned: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date(0),
  },
  {
    id: 'user-active',
    name: 'Alice User',
    email: 'alice@example.test',
    role: 'user',
    banned: false,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date(0),
  },
  {
    id: 'user-banned',
    name: 'Mona Banned',
    email: 'mona@example.test',
    role: 'user',
    banned: true,
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    updatedAt: new Date(0),
  },
  {
    // Legacy rows created before the ban feature have a null flag.
    id: 'user-null-banned',
    name: 'Bob Legacy',
    email: 'bob@example.test',
    role: 'user',
    banned: null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date(0),
  },
];

beforeAll(async () => {
  const migrations = new URL('../../../src/db/migrations/', import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    await client.executeMultiple(
      readFileSync(new URL(file, migrations), 'utf8')
    );
  }
  await db.insert(user).values(seeded);
});

// mockReset is enabled in vitest.config.ts, so the return value has to be
// re-established before every test rather than once in beforeAll.
beforeEach(() => mocks.getDb.mockReturnValue(db));

afterAll(() => client.close());

describe('role filter', () => {
  test('returns only users with the requested role', async () => {
    const result = await list(query({ role: 'admin' }));

    expect(result.items.map((item) => item.id)).toEqual(['admin-active']);
    expect(result.total).toBe(1);
  });

  test('ignores a blank role filter', async () => {
    const all = await list(query());
    const blank = await list(query({ role: '   ' }));

    expect(blank.total).toBe(all.total);
  });

  test('returns nothing for an unknown role', async () => {
    const result = await list(query({ role: 'superuser' }));

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe('status filter', () => {
  test('treats a false or null banned flag as active', async () => {
    const ids = (await list(query({ status: 'active' }))).items.map(
      (item) => item.id
    );

    expect(ids).toContain('admin-active');
    expect(ids).toContain('user-active');
    expect(ids).toContain('user-null-banned');
    expect(ids).not.toContain('user-banned');
  });

  test('returns only banned users for the inactive filter', async () => {
    const result = await list(query({ status: 'inactive' }));

    expect(result.items.map((item) => item.id)).toEqual(['user-banned']);
  });

  test('combines role and status filters', async () => {
    const result = await list(query({ role: 'user', status: 'inactive' }));

    expect(result.items.map((item) => item.id)).toEqual(['user-banned']);
  });

  test('combines a search with a role filter', async () => {
    const result = await list(query({ search: 'alice', role: 'user' }));

    expect(result.items.map((item) => item.id)).toEqual(['user-active']);
  });
});

describe('sorting', () => {
  test('sorts by name ascending and descending', async () => {
    const asc = await list(query({ sortId: 'name', sortDesc: false }));
    const desc = await list(query({ sortId: 'name', sortDesc: true }));

    expect(asc.items[0].id).toBe('user-active');
    expect(desc.items[0].id).toBe('admin-active');
  });

  test('sorts by email ascending and descending', async () => {
    const asc = await list(query({ sortId: 'email', sortDesc: false }));
    const desc = await list(query({ sortId: 'email', sortDesc: true }));

    expect(asc.items[0].email < asc.items[1].email).toBe(true);
    expect(desc.items[0].email > desc.items[1].email).toBe(true);
  });

  test('sorts by createdAt ascending and descending', async () => {
    const asc = await list(query({ sortId: 'createdAt', sortDesc: false }));
    const desc = await list(query({ sortId: 'createdAt', sortDesc: true }));

    expect(asc.items[0].id).toBe('admin-active');
    expect(desc.items[0].id).toBe('user-null-banned');
  });

  test.each([
    'NAME',
    'Email',
    ' createdAt ',
  ])('normalizes the sort id %j to a known field', async (sortId) => {
    const result = await list(query({ sortId }));

    expect(result.items).toHaveLength(seeded.length);
  });

  test.each([
    'unknown-field',
    '',
  ])('falls back to createdAt for the sort id %j', async (sortId) => {
    const result = await list(query({ sortId }));

    expect(result.items[0].id).toBe('admin-active');
  });
});

describe('pagination over a filtered set', () => {
  test('reports the filtered total rather than the table size', async () => {
    const result = await list(
      query({ pageIndex: 0, pageSize: 1, role: 'user' })
    );

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(3);
  });

  test('returns distinct rows on consecutive pages', async () => {
    const first = await list(
      query({ pageIndex: 0, pageSize: 2, sortId: 'createdAt' })
    );
    const second = await list(
      query({ pageIndex: 1, pageSize: 2, sortId: 'createdAt' })
    );

    expect(first.items.map((item) => item.id)).not.toEqual(
      second.items.map((item) => item.id)
    );
    expect(first.total).toBe(second.total);
  });

  test('returns an empty page past the end', async () => {
    const result = await list(query({ pageIndex: 5, pageSize: 10 }));

    expect(result.items).toEqual([]);
    expect(result.total).toBe(seeded.length);
  });
});
