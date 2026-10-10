'use strict';

const path = require('path');

const packageLock = require('../package-lock.json');

describe('Istanbul YAML dependency path', () => {
  test('does not resolve the vulnerable sprintf-js dependency', () => {
    const paths = Object.keys(packageLock.packages);
    expect(paths.some((entry) => entry.endsWith('/node_modules/sprintf-js'))).toBe(false);
    expect(paths.some((entry) => entry.endsWith('/node_modules/argparse') &&
      packageLock.packages[entry].version.startsWith('1.'))).toBe(false);

    const istanbulDirectory = path.dirname(require.resolve('@istanbuljs/load-nyc-config'));
    const resolvedYaml = require.resolve('js-yaml', { paths: [istanbulDirectory] });
    expect(resolvedYaml).toBe(require.resolve('js-yaml'));
  });

  test('the replacement parser loads ordinary YAML configuration', () => {
    const yaml = require('js-yaml');
    expect(yaml.load('include:\n  - app/**\nexclude:\n  - node_modules/**\n')).toEqual({
      include: ['app/**'],
      exclude: ['node_modules/**'],
    });
  });
});
