import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

const root = resolve(__dirname, '..');

describe('Workout V2 anatomy pipeline', () => {
  it('verifies source/runtime parity and provenance', () => {
    const result = spawnSync(process.execPath, ['scripts/verifyAnatomyV2.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ANATOMY V2 PIPELINE OK');
    expect(existsSync(resolve(root, 'assets/anatomy-v2/PROVENANCE.md'))).toBe(true);
  });

  it('keeps V2 generated data isolated from production BodyMap', () => {
    expect(existsSync(resolve(root, 'components/workout-v2/anatomyV2Front.ts'))).toBe(true);
    expect(existsSync(resolve(root, 'components/workout-v2/anatomyV2Back.ts'))).toBe(true);
    const bodyMap = readFileSync(resolve(root, 'components/fitness/BodyMap.tsx'), 'utf8');
    expect(bodyMap).not.toContain('anatomyV2Front');
    expect(bodyMap).not.toContain('anatomyV2Back');
  });
});
