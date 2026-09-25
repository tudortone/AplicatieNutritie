'use strict';

const crypto = require('crypto');
const { createAdmobSsvVerifier } = require('../utils/admobSsv');
const CONTRACT = { expectedAdUnit: '3566028223', expectedRewardAmount: '1', expectedRewardItem: 'Flow Credit' };

function fixture({ signDecoded = false, ...overrides } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ keys: [{ keyId: 7, pem }] }) }));
  const value = {
    adUnit: '3566028223',
    amount: '1',
    item: 'Flow Credit',
    customData: 'secret-token',
    transactionId: 'transaction-1',
    userId: '11111111-1111-4111-8111-111111111111',
    ...overrides,
  };
  const data = ['ad_network=123', `ad_unit=${value.adUnit}`, `custom_data=${value.customData}`, `reward_amount=${value.amount}`, `reward_item=${encodeURIComponent(value.item)}`, 'timestamp=1700000000000', `transaction_id=${value.transactionId}`, `user_id=${value.userId}`].join('&');
  const signedContent = signDecoded ? decodeURIComponent(data) : data;
  const signature = crypto.sign('sha256', Buffer.from(signedContent), privateKey).toString('base64url');
  return { fetchImpl, data, rawUrl: `/api/v1/webhooks/admob/rewarded?${data}&signature=${signature}&key_id=7` };
}

describe('AdMob rewarded SSV verifier', () => {
  test('accepts a valid Google-signed callback for the exact reward contract', async () => {
    const f = fixture();
    await expect(createAdmobSsvVerifier({ fetchImpl: f.fetchImpl, ...CONTRACT }).verify(f.rawUrl)).resolves.toEqual({ kind: 'reward', intentId: '11111111-1111-4111-8111-111111111111', customData: 'secret-token', transactionId: 'transaction-1' });
  });
  test('rejects missing signature without fetching keys', async () => {
    const f = fixture();
    await expect(createAdmobSsvVerifier({ fetchImpl: f.fetchImpl, ...CONTRACT }).verify(`/api/v1/webhooks/admob/rewarded?${f.data}&key_id=7`)).rejects.toMatchObject({ code: 'SSV_FORMAT_INVALID', status: 400 });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  test('accepts optional base64url padding used by verification tools', async () => {
    const f = fixture();
    const marker = f.rawUrl.indexOf('&signature=');
    const before = f.rawUrl.slice(0, marker);
    const tail = f.rawUrl.slice(marker).replace(/(&signature=[^&]+)/, '$1=');
    await expect(createAdmobSsvVerifier({ fetchImpl: f.fetchImpl, ...CONTRACT }).verify(before + tail))
      .resolves.toMatchObject({ transactionId: 'transaction-1' });
  });
  test('matches the decoded URI query used by the official Google verifier', async () => {
    const f = fixture({ signDecoded: true });
    await expect(createAdmobSsvVerifier({ fetchImpl: f.fetchImpl, ...CONTRACT }).verify(f.rawUrl))
      .resolves.toMatchObject({ transactionId: 'transaction-1' });
  });
  test('rejects tampered signed data', async () => {
    const f = fixture();
    await expect(createAdmobSsvVerifier({ fetchImpl: f.fetchImpl, ...CONTRACT }).verify(f.rawUrl.replace('reward_amount=1', 'reward_amount=9'))).rejects.toMatchObject({ code: 'SSV_SIGNATURE_INVALID' });
  });
  test.each([[{ adUnit: '1542500110' }, 'SSV_AD_UNIT_MISMATCH'], [{ amount: '9' }, 'SSV_REWARD_AMOUNT_MISMATCH'], [{ item: 'Coins' }, 'SSV_REWARD_ITEM_MISMATCH']])('rejects signed contract mismatch %j', async (overrides, code) => {
    const f = fixture(overrides);
    await expect(createAdmobSsvVerifier({ fetchImpl: f.fetchImpl, ...CONTRACT }).verify(f.rawUrl)).rejects.toMatchObject({ code });
  });
  test('rejects duplicate transaction IDs', async () => {
    const f = fixture();
    await expect(createAdmobSsvVerifier({ fetchImpl: f.fetchImpl, ...CONTRACT }).verify(`${f.rawUrl}&transaction_id=second`)).rejects.toMatchObject({ code: 'SSV_DUPLICATE_PARAMETER' });
  });

  test('classifies the exact Google-signed AdMob console probe without making it grant-eligible', async () => {
    const f = fixture({
      signDecoded: true,
      adUnit: '1234567890',
      userId: 'ssv-admob-verification',
      customData: 'ssv-verification',
      transactionId: 'admob-console-verification-1',
    });
    await expect(createAdmobSsvVerifier({ fetchImpl: f.fetchImpl, ...CONTRACT }).verify(f.rawUrl)).resolves.toEqual({
      kind: 'console_verification',
      transactionId: 'admob-console-verification-1',
    });
  });

  test('rejects unsigned or tampered console verification lookalikes', async () => {
    const f = fixture({
      adUnit: '1234567890',
      userId: 'ssv-admob-verification',
      customData: 'ssv-verification',
      transactionId: 'admob-console-verification-2',
    });
    await expect(createAdmobSsvVerifier({ fetchImpl: f.fetchImpl, ...CONTRACT }).verify(`/api/v1/webhooks/admob/rewarded?${f.data}&key_id=7`))
      .rejects.toMatchObject({ code: 'SSV_FORMAT_INVALID' });
    await expect(createAdmobSsvVerifier({ fetchImpl: f.fetchImpl, ...CONTRACT }).verify(f.rawUrl.replace('reward_amount=1', 'reward_amount=9')))
      .rejects.toMatchObject({ code: 'SSV_SIGNATURE_INVALID' });
  });

  test('rejects signed test-unit requests that do not exactly match the console probe contract', async () => {
    const f = fixture({ adUnit: '1234567890', userId: 'real-intent', customData: 'real-secret' });
    await expect(createAdmobSsvVerifier({ fetchImpl: f.fetchImpl, ...CONTRACT }).verify(f.rawUrl))
      .rejects.toMatchObject({ code: 'SSV_AD_UNIT_MISMATCH' });
  });
});
