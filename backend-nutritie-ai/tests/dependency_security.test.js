'use strict';

const packageLock = require('../package-lock.json');

describe('test-tool YAML dependency path', () => {
  test('does not install legacy argparse or vulnerable sprintf-js', () => {
    const packages = packageLock.packages;
    expect(packages['node_modules/js-yaml'].version).toBe('4.3.2');
    expect(packages['node_modules/argparse'].version).toBe('2.0.1');
    expect(Object.keys(packages).some((entry) => entry.endsWith('/node_modules/sprintf-js'))).toBe(false);
  });
});
