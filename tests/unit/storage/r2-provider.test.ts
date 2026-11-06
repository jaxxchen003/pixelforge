import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {} as { BUCKET?: unknown },
}));

vi.mock('cloudflare:workers', () => ({ env: mocks.env }));

import { R2Provider } from '@/storage/provider/r2';
import {
  ConfigurationError,
  R2_ERROR_CODES,
  StorageError,
  UploadError,
} from '@/storage/types';
import { isPublicFolder, sanitizeFolder } from '@/storage/utils';
import {
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_USER_FILES_FOLDER,
} from '@/storage/constants';

type StoredObject = {
  body: string;
  httpMetadata?: { contentType?: string };
  uploaded: Date;
};

type ListedObject = { key: string; size: number; uploaded: Date };

function createBucket() {
  const objects = new Map<string, StoredObject>();
  return {
    objects,
    put: vi.fn(
      async (
        key: string,
        value: Blob | ArrayBufferView | string,
        options?: { httpMetadata?: { contentType?: string } }
      ) => {
        objects.set(key, {
          body:
            typeof value === 'string'
              ? value
              : value instanceof Blob
                ? await value.text()
                : new TextDecoder().decode(
                    value as ArrayBufferView as Uint8Array
                  ),
          httpMetadata: options?.httpMetadata,
          uploaded: new Date(0),
        });
        return {};
      }
    ),
    get: vi.fn(async (key: string) => {
      const object = objects.get(key);
      if (!object) return null;
      return {
        body: new Blob([object.body]).stream(),
        httpMetadata: object.httpMetadata,
      };
    }),
    head: vi.fn(async (key: string) => {
      const object = objects.get(key);
      if (!object) return null;
      return { size: object.body.length, httpMetadata: object.httpMetadata };
    }),
    delete: vi.fn(async (key: string) => {
      objects.delete(key);
    }),
    list: vi.fn(
      async (): Promise<{
        objects: ListedObject[];
        truncated: boolean;
        cursor?: string;
      }> => ({ objects: [], truncated: false })
    ),
  };
}

let bucket: ReturnType<typeof createBucket>;

beforeEach(() => {
  bucket = createBucket();
  mocks.env.BUCKET = bucket;
});

describe('R2 upload key scoping', () => {
  test('scopes private uploads under the user folder', async () => {
    const provider = new R2Provider();
    const result = await provider.uploadFile({
      file: Buffer.from('hello'),
      filename: 'note.txt',
      contentType: 'text/plain',
      userId: 'user-1',
      requestOrigin: 'https://example.test',
    });

    expect(result.key.startsWith(`${DEFAULT_USER_FILES_FOLDER}/user-1/`)).toBe(
      true
    );
    expect(result.key.endsWith('-note.txt')).toBe(true);
    expect(result.url).toBe(
      `https://example.test/api/storage/file?key=${encodeURIComponent(result.key)}`
    );
    expect(result.metadata).toMatchObject({
      userId: 'user-1',
      originalName: 'note.txt',
      contentType: 'text/plain',
      size: 5,
      r2Key: result.key,
    });
  });

  test('uses the requested folder ahead of the default user folder', async () => {
    const provider = new R2Provider();
    const result = await provider.uploadFile({
      file: Buffer.from('x'),
      filename: 'report.pdf',
      contentType: 'application/pdf',
      folder: 'reports',
      userId: 'user-1',
    });

    expect(result.key.startsWith('reports/user-1/')).toBe(true);
    // Without requestOrigin the raw key is returned as the URL.
    expect(result.url).toBe(result.key);
  });

  test('keeps shared folders unscoped and metadata-free', async () => {
    const provider = new R2Provider();
    const result = await provider.uploadFile({
      file: Buffer.from('x'),
      filename: 'avatar.png',
      contentType: 'image/png',
      folder: 'avatars',
    });

    expect(result.key.startsWith('avatars/')).toBe(true);
    expect(result.key.includes('/undefined/')).toBe(false);
    expect(result.metadata).toBeUndefined();
  });

  test('stores a bare filename when no folder or user is provided', async () => {
    const provider = new R2Provider();
    const result = await provider.uploadFile({
      file: Buffer.from('x'),
      filename: 'loose.txt',
      contentType: 'text/plain',
    });

    expect(result.key.includes('/')).toBe(false);
    expect(result.key.endsWith('-loose.txt')).toBe(true);
  });

  test('sanitizes path traversal and unsafe characters in the filename', async () => {
    const provider = new R2Provider();
    const result = await provider.uploadFile({
      file: Buffer.from('x'),
      filename: '../../etc/pa ss;word.txt',
      contentType: 'text/plain',
      userId: 'user-1',
    });

    // Dots survive inside the final segment, but no separator does, so the
    // stored key cannot escape the user folder.
    const segments = result.key.split('/');
    expect(segments).toHaveLength(3);
    expect(segments[0]).toBe('userfiles');
    expect(segments[1]).toBe('user-1');
    expect(segments).not.toContain('..');
    expect(segments.at(-1)).toBe(
      `${result.metadata?.id}-.._.._etc_pa_ss_word.txt`
    );
  });

  test('records the declared content type on the stored object', async () => {
    const provider = new R2Provider();
    const result = await provider.uploadFile({
      file: Buffer.from('x'),
      filename: 'image.png',
      contentType: 'image/png',
      userId: 'user-1',
    });

    expect(bucket.put).toHaveBeenCalledTimes(1);
    expect(bucket.objects.get(result.key)?.httpMetadata).toEqual({
      contentType: 'image/png',
    });
  });
});

describe('R2 file validation', () => {
  test('rejects a file above the configured maximum size', async () => {
    const provider = new R2Provider();
    // Blob.size is read-only, so override it on a real Blob to simulate a
    // file that exceeds the configured limit.
    const oversized = new Blob([Buffer.from('x')]);
    Object.defineProperty(oversized, 'size', {
      value: DEFAULT_MAX_FILE_SIZE + 1,
    });

    await expect(
      provider.uploadFile({
        file: oversized,
        filename: 'big.txt',
        contentType: 'text/plain',
        userId: 'user-1',
      })
    ).rejects.toThrow(R2_ERROR_CODES.FILE_TOO_LARGE);
    expect(bucket.put).not.toHaveBeenCalled();
  });

  test('rejects a content type that disagrees with the extension', async () => {
    const provider = new R2Provider();

    await expect(
      provider.uploadFile({
        file: Buffer.from('<script>alert(1)</script>'),
        filename: 'payload.jpg',
        contentType: 'text/plain',
        userId: 'user-1',
      })
    ).rejects.toThrow(/does not match file extension '\.jpg'/);
    expect(bucket.put).not.toHaveBeenCalled();
  });

  test.each([
    'text/html',
    'application/javascript',
    'text/javascript',
    'application/x-httpd-php',
    'application/xhtml+xml',
  ])('rejects the dangerous content type %s', async (contentType) => {
    const provider = new R2Provider();

    await expect(
      provider.uploadFile({
        file: Buffer.from('<script>alert(1)</script>'),
        filename: 'no-extension',
        contentType,
        userId: 'user-1',
      })
    ).rejects.toThrow(/is not allowed for uploads/);
    expect(bucket.put).not.toHaveBeenCalled();
  });

  test('rejects a dangerous content type that matches its own extension', async () => {
    const provider = new R2Provider();

    await expect(
      provider.uploadFile({
        file: Buffer.from('<script>alert(1)</script>'),
        filename: 'page.html',
        contentType: 'text/html',
        userId: 'user-1',
      })
    ).rejects.toThrow(/is not allowed for uploads/);
    expect(bucket.put).not.toHaveBeenCalled();
  });

  test('accepts an unknown content type without an extension to cross-check', async () => {
    const provider = new R2Provider();
    const result = await provider.uploadFile({
      file: Buffer.from('x'),
      filename: 'README',
      contentType: 'text/plain',
      userId: 'user-1',
    });

    expect(result.key.endsWith('-README')).toBe(true);
  });

  test('surfaces validation failures as UploadError', async () => {
    const provider = new R2Provider();

    await expect(
      provider.uploadFile({
        file: Buffer.from('<script>alert(1)</script>'),
        filename: 'page.html',
        contentType: 'text/html',
        userId: 'user-1',
      })
    ).rejects.toBeInstanceOf(UploadError);
  });
});

describe('R2 reads and deletes', () => {
  test('reads a stored object with its content type', async () => {
    const provider = new R2Provider();
    const { key } = await provider.uploadFile({
      file: Buffer.from('body'),
      filename: 'note.txt',
      contentType: 'text/plain',
      userId: 'user-1',
    });

    const file = await provider.getFile(key);
    expect(file?.contentType).toBe('text/plain');
    expect(await new Response(file?.body).text()).toBe('body');
  });

  test('falls back to octet-stream when the object has no content type', async () => {
    const provider = new R2Provider();
    bucket.objects.set('legacy.bin', { body: 'x', uploaded: new Date(0) });

    const file = await provider.getFile('legacy.bin');
    expect(file?.contentType).toBe('application/octet-stream');
  });

  test('returns null for a missing object', async () => {
    const provider = new R2Provider();

    await expect(provider.getFile('missing.txt')).resolves.toBeNull();
    await expect(provider.getFileInfo('missing.txt')).resolves.toBeNull();
  });

  test('reports size and content type from a head request', async () => {
    const provider = new R2Provider();
    const { key } = await provider.uploadFile({
      file: Buffer.from('abcd'),
      filename: 'note.txt',
      contentType: 'text/plain',
      userId: 'user-1',
    });

    await expect(provider.getFileInfo(key)).resolves.toEqual({
      size: 4,
      contentType: 'text/plain',
    });
  });

  test('downloads by key and by metadata', async () => {
    const provider = new R2Provider();
    const result = await provider.uploadFile({
      file: Buffer.from('body'),
      filename: 'note.txt',
      contentType: 'text/plain',
      userId: 'user-1',
    });

    expect(
      await new Response(await provider.downloadFile(result.key)).text()
    ).toBe('body');
    expect(
      await new Response(await provider.downloadFile(result.metadata!)).text()
    ).toBe('body');
  });

  test('wraps bucket delete failures in StorageError', async () => {
    const provider = new R2Provider();
    bucket.delete.mockRejectedValueOnce(new Error('bucket offline'));

    await expect(provider.deleteFile('some/key.txt')).rejects.toBeInstanceOf(
      StorageError
    );
  });
});

describe('R2 provider configuration', () => {
  test('throws ConfigurationError when the bucket binding is missing', () => {
    mocks.env.BUCKET = undefined;

    expect(() => new R2Provider()).toThrow(ConfigurationError);
  });

  test('reports the provider name', () => {
    expect(new R2Provider().getProviderName()).toBe('r2');
  });

  test('caps the requested list page size at 100', async () => {
    const provider = new R2Provider();

    await provider.listUserFiles('user-1', { limit: 500 });

    expect(bucket.list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 101, prefix: `userfiles/user-1/` })
    );
  });

  test('reports hasMore and drops the lookahead object when truncated', async () => {
    const provider = new R2Provider();
    bucket.list.mockResolvedValueOnce({
      objects: Array.from({ length: 3 }, (_, index) => ({
        key: `userfiles/user-1/${index}.txt`,
        size: index,
        uploaded: new Date(0),
      })),
      truncated: true,
      cursor: 'next-page',
    });

    const page = await provider.listUserFiles('user-1', { limit: 2 });

    expect(page.objects).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('next-page');
  });
});

describe('storage key helpers', () => {
  test.each([
    ['a/b', 'a/b'],
    ['/a/b/', 'a/b'],
    ['a/./b', 'a/b'],
    ['a/../b', 'a/b'],
    ['re ports', 're-ports'],
    ['', undefined],
    ['   ', undefined],
    [undefined, undefined],
  ])('sanitizeFolder(%j) => %j', (input, expected) => {
    expect(sanitizeFolder(input)).toBe(expected);
  });

  test.each([
    ['avatars', true],
    ['avatars/2024', true],
    ['AVATARS', false],
    ['avatars-extra', false],
    ['userfiles', false],
    [undefined, false],
  ])('isPublicFolder(%j) => %j', (input, expected) => {
    expect(isPublicFolder(input)).toBe(expected);
  });
});
