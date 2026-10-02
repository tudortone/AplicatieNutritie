import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

const root = resolve(__dirname, '..');

describe('P1-07 anatomy asset pipeline contract', () => {
  it('verifies the canonical SVG sources and committed runtime outputs', () => {
    const result = spawnSync(process.execPath, ['scripts/verifyAnatomy.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ANATOMY PIPELINE OK');
  });

  it('keeps BodyMap bound to both canonical runtime outputs', () => {
    const bodyMap = readFileSync(resolve(root, 'components/fitness/BodyMap.tsx'), 'utf8');
    expect(bodyMap).toContain("from './anatomyFront'");
    expect(bodyMap).toContain("from './anatomyBack'");
    expect(bodyMap).not.toContain('anatomyPaths.generated');
  });

  it('does not retain unreferenced duplicate GLB models', () => {
    expect(existsSync(resolve(root, 'assets/models/realistic_anatomy.glb'))).toBe(false);
    expect(existsSync(resolve(root, 'assets/models/human_model.glb'))).toBe(false);
  });
});
