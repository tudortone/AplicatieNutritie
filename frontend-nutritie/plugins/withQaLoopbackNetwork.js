'use strict';
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function withQaLoopbackNetwork(config) {
  if (process.env.EXPO_PUBLIC_APP_ENV !== 'qa') throw new Error('QA native policy cannot run outside QA.');
  config = withAndroidManifest(config, (mod) => {
    mod.modResults.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const app = mod.modResults.manifest.application[0];
    app.$['android:networkSecurityConfig'] = '@xml/getflow_qa_network_security';
    app.$['android:usesCleartextTraffic'] = 'false';
    // SDK dependencies remain linked, but these automatic initializers must not run in QA.
    const disabled = ['com.google.android.gms.ads.MobileAdsInitProvider', 'io.sentry.android.core.SentryInitProvider', 'io.sentry.android.core.SentryPerformanceProvider'];
    app.provider = (app.provider || []).filter((p) => !disabled.includes(p.$['android:name']));
    app.provider.push(...disabled.map((name) => ({ $: { 'android:name': name, 'tools:node': 'remove' } })));
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    const dir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'getflow_qa_network_security.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n  <base-config cleartextTrafficPermitted="false" />\n  <domain-config cleartextTrafficPermitted="true">\n    <domain includeSubdomains="false">127.0.0.1</domain>\n  </domain-config>\n</network-security-config>\n');
    return mod;
  }]);
};
