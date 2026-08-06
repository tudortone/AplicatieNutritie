'use strict';

const fs = require('fs');
const path = require('path');
const createGdprRouter = require('../routes/gdpr');

describe('GDPR account deletion', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('extrage ID-urile ImageKit din structuri istorice imbricate si elimina duplicatele', () => {
    const ids = createGdprRouter.extrageFileIds([
      { alimente: [{ imageKitFileId: 'abcDEF_123' }] },
      { fileId: 'legacy-456' },
      { nested: { imagekit_file_id: 'abcDEF_123' } },
      { fileId: '../invalid' },
    ]);
    expect([...ids].sort()).toEqual(['abcDEF_123', 'legacy-456']);
  });

  test('sterge folderele curent si legacy plus activele identificate', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });

    await createGdprRouter.stergeActiveImageKit({
      userId: '22222222-2222-4222-8222-222222222222',
      fileIds: new Set(['abcDEF_123']),
      privateKey: 'private_test_key',
    });

    expect(global.fetch).toHaveBeenCalledTimes(3);
    const bodies = global.fetch.mock.calls
      .map(([, options]) => options?.body)
      .filter(Boolean)
      .map(JSON.parse);
    expect(bodies).toContainEqual({
      folderPath: '/mancare/22222222-2222-4222-8222-222222222222/',
    });
    expect(bodies).toContainEqual({
      folderPath: '/meals/22222222-2222-4222-8222-222222222222/',
    });
  });

  test('considera 404 Clerk un succes idempotent', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });

    await expect(createGdprRouter.stergeIdentitateClerk({
      clerkUserId: 'user_123',
      secretKey: 'sk_test_not_real',
    })).resolves.toBeUndefined();
  });

  test('sterge Auth ultima si lasa FK-urile sa execute cascada', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../routes/gdpr.js'),
      'utf8',
    );
    expect(source).toContain('supabaseAdmin.auth.admin.deleteUser(userId)');
    expect(source).not.toMatch(/from\('clerk_user_map'\)\s*\.delete/);
    expect(source).not.toContain("sterge('mese')");
    expect(source).not.toContain("sterge('audit_log')");
  });
});
