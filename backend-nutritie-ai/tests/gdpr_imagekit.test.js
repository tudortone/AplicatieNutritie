'use strict';

const createGdprRouter = require('../routes/gdpr');

describe('GDPR ImageKit', () => {
  test('extrage ID-urile ImageKit din structuri istorice imbricate si elimina duplicatele', () => {
    const ids = createGdprRouter.extrageFileIds([
      { alimente: [{ imageKitFileId: 'abcDEF_123' }] },
      { fileId: 'legacy-456' },
      { nested: { imagekit_file_id: 'abcDEF_123' } },
      { fileId: '../invalid' },
    ]);
    expect([...ids].sort()).toEqual(['abcDEF_123', 'legacy-456']);
  });
});
