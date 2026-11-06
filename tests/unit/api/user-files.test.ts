import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
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
vi.mock('@/middlewares/auth-middleware', () => ({ authApiMiddleware: {} }));
vi.mock('@/db', () => ({ getDb: mocks.getDb }));
vi.mock('@/lib/urls', () => ({
  getBaseUrl: () => 'https://example.test',
}));
vi.mock('@/storage', () => ({
  uploadFile: mocks.uploadFile,
  deleteFile: mocks.deleteFile,
}));

import {
  deleteUserFile,
  listUserFiles,
  uploadUserFile,
} from '@/api/user-files';
import { StorageError, UploadError } from '@/storage/types';

const client = createClient({ url: ':memory:' });
const db = drizzle(client);

type Ctx = { userId: string };

const list = listUserFiles as unknown as (input: {
  data: { pageIndex: number; pageSize: number };
  context: Ctx;
}) => Promise<{ items: Array<Record<string, unknown>>; total: number }>;

const remove = deleteUserFile as unknown as (input: {
  data: { id: string };
  context: Ctx;
}) => Promise<void>;

const upload = uploadUserFile as unknown as (input: {
  data: {
    file: File;
    folder?: string;
    isPublic?: boolean;
    description?: string;
  };
  context: Ctx;
}) => Promise<{
  key: string;
  url: string;
  metadata?: Record<string, unknown>;
}>;

async function seedFile(options: {
  id: string;
  userId: string;
  r2Key?: string;
  createdAt?: Date;
}) {
  const createdAt = options.createdAt ?? new Date('2026-01-01T00:00:00.000Z');
  await client.execute({
    sql: `INSERT INTO user_files (
      id, user_id, filename, original_name, content_type, size, r2_key,
      is_public, description, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      options.id,
      options.userId,
      `${options.id}-note.txt`,
      'note.txt',
      'text/plain',
      4,
      options.r2Key ?? `userfiles/${options.userId}/${options.id}-note.txt`,
      null,
      null,
      createdAt.getTime(),
      createdAt.getTime(),
    ],
  });
}

beforeEach(async () => {
  await client.executeMultiple(`
    DROP TABLE IF EXISTS user_files;
    CREATE TABLE user_files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      r2_key TEXT NOT NULL,
      is_public INTEGER,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  mocks.getDb.mockReturnValue(db);
  mocks.uploadFile.mockReset();
  mocks.deleteFile.mockReset();
});

afterAll(() => client.close());

describe('listUserFiles', () => {
  test('returns only the calling user files, newest first', async () => {
    await seedFile({
      id: 'old',
      userId: 'user_a',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await seedFile({
      id: 'new',
      userId: 'user_a',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    });
    await seedFile({ id: 'other', userId: 'user_b' });

    const result = await list({
      data: { pageIndex: 0, pageSize: 10 },
      context: { userId: 'user_a' },
    });

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual(['new', 'old']);
  });

  test('paginates without leaking the total', async () => {
    for (const id of ['a', 'b', 'c']) {
      await seedFile({
        id,
        userId: 'user_a',
        createdAt: new Date(`2026-0${['a', 'b', 'c'].indexOf(id) + 1}-01`),
      });
    }

    const page = await list({
      data: { pageIndex: 1, pageSize: 2 },
      context: { userId: 'user_a' },
    });

    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(1);
  });

  test('returns an empty page for a user with no files', async () => {
    const result = await list({
      data: { pageIndex: 0, pageSize: 10 },
      context: { userId: 'user_a' },
    });

    expect(result).toEqual({ items: [], total: 0 });
  });
});

describe('deleteUserFile', () => {
  test('removes the object and then the row', async () => {
    await seedFile({ id: 'file_1', userId: 'user_a' });
    const order: string[] = [];
    mocks.deleteFile.mockImplementation(async () => {
      order.push('storage');
    });

    await remove({ data: { id: 'file_1' }, context: { userId: 'user_a' } });

    const rows = await client.execute('SELECT id FROM user_files');
    expect(rows.rows).toHaveLength(0);
    expect(mocks.deleteFile).toHaveBeenCalledWith(
      'userfiles/user_a/file_1-note.txt'
    );
    expect(order).toEqual(['storage']);
  });

  test('refuses to delete another user file', async () => {
    await seedFile({ id: 'file_1', userId: 'user_b' });

    await expect(
      remove({ data: { id: 'file_1' }, context: { userId: 'user_a' } })
    ).rejects.toThrow('File not found');

    expect(mocks.deleteFile).not.toHaveBeenCalled();
    const rows = await client.execute('SELECT id FROM user_files');
    expect(rows.rows).toHaveLength(1);
  });

  test('keeps the row when the storage delete fails', async () => {
    await seedFile({ id: 'file_1', userId: 'user_a' });
    mocks.deleteFile.mockRejectedValue(new StorageError('bucket offline'));

    await expect(
      remove({ data: { id: 'file_1' }, context: { userId: 'user_a' } })
    ).rejects.toThrow('bucket offline');

    const rows = await client.execute('SELECT id FROM user_files');
    expect(rows.rows).toHaveLength(1);
  });
});

describe('uploadUserFile', () => {
  const privateUpload = {
    file: new File([Buffer.from('body')], 'note.txt', { type: 'text/plain' }),
  };

  beforeEach(() => {
    mocks.uploadFile.mockResolvedValue({
      url: 'https://example.test/api/storage/file?key=userfiles%2Fuser_a%2Fx-note.txt',
      key: 'userfiles/user_a/x-note.txt',
      metadata: {
        id: 'x',
        userId: 'user_a',
        filename: 'x-note.txt',
        originalName: 'note.txt',
        contentType: 'text/plain',
        size: 4,
        r2Key: 'userfiles/user_a/x-note.txt',
        uploadedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
  });

  test('scopes a private upload to the user and records a row', async () => {
    const result = await upload({
      data: privateUpload,
      context: { userId: 'user_a' },
    });

    expect(mocks.uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      'note.txt',
      'text/plain',
      expect.objectContaining({
        folder: undefined,
        userId: 'user_a',
        requestOrigin: 'https://example.test',
      })
    );
    expect(result.key).toBe('userfiles/user_a/x-note.txt');

    const rows = await client.execute('SELECT id, user_id FROM user_files');
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({ id: 'x', user_id: 'user_a' });
  });

  test('uploads to a public folder without user scoping or a DB row', async () => {
    mocks.uploadFile.mockResolvedValue({
      url: 'https://example.test/api/storage/file?key=avatars%2Fx.png',
      key: 'avatars/x.png',
    });

    const result = await upload({
      data: {
        file: new File([Buffer.from('x')], 'avatar.png', { type: 'image/png' }),
        folder: 'avatars',
      },
      context: { userId: 'user_a' },
    });

    expect(mocks.uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      'avatar.png',
      'image/png',
      expect.objectContaining({ folder: 'avatars', userId: undefined })
    );
    expect(result.metadata).toBeUndefined();

    const rows = await client.execute('SELECT id FROM user_files');
    expect(rows.rows).toHaveLength(0);
  });

  test('stores isPublic and description when provided', async () => {
    await upload({
      data: { ...privateUpload, isPublic: true, description: 'shared note' },
      context: { userId: 'user_a' },
    });

    const rows = await client.execute(
      'SELECT is_public, description FROM user_files'
    );
    expect(rows.rows[0]).toMatchObject({
      is_public: 1,
      description: 'shared note',
    });
  });

  test('rethrows an upload validation error verbatim', async () => {
    mocks.uploadFile.mockRejectedValue(
      new UploadError('File type not supported. Please choose a different file')
    );

    await expect(
      upload({ data: privateUpload, context: { userId: 'user_a' } })
    ).rejects.toThrow(
      'File type not supported. Please choose a different file'
    );

    const rows = await client.execute('SELECT id FROM user_files');
    expect(rows.rows).toHaveLength(0);
  });

  test('rethrows a storage error verbatim', async () => {
    mocks.uploadFile.mockRejectedValue(new StorageError('bucket offline'));

    await expect(
      upload({ data: privateUpload, context: { userId: 'user_a' } })
    ).rejects.toThrow('bucket offline');
  });

  test('replaces an unexpected error with a generic message', async () => {
    mocks.uploadFile.mockRejectedValue(
      new Error('D1_ERROR: no such table: user_files')
    );

    await expect(
      upload({ data: privateUpload, context: { userId: 'user_a' } })
    ).rejects.toThrow('Something went wrong while uploading the file');
  });

  test('does not leak internals through the generic message', async () => {
    mocks.uploadFile.mockRejectedValue(
      new Error('D1_ERROR: no such table: user_files')
    );

    await expect(
      upload({ data: privateUpload, context: { userId: 'user_a' } })
    ).rejects.not.toThrow(/D1_ERROR|user_files/);
  });

  test('scopes an explicit non-public folder to the user', async () => {
    await upload({
      data: { ...privateUpload, folder: 'reports' },
      context: { userId: 'user_a' },
    });

    expect(mocks.uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      'note.txt',
      'text/plain',
      expect.objectContaining({ folder: 'reports', userId: 'user_a' })
    );
  });
});
