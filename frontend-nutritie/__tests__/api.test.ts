import { API_PREFIX, buildApiUrl, getCleanApiBaseUrl } from '../lib/api';

describe('lib/api — test de integrare client', () => {
  it('API_PREFIX este strict /api/v1', () => {
    expect(API_PREFIX).toBe('/api/v1');
  });

  it('buildApiUrl construiește corect căile cu prefixul canonical /api/v1', () => {
    const url = buildApiUrl('/mese');
    expect(url).toContain('/api/v1/mese');
  });

  it('buildApiUrl păstrează căile care încep deja cu /api/', () => {
    const url = buildApiUrl('/api/custom-endpoint');
    expect(url).toContain('/api/custom-endpoint');
  });
});
