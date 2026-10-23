'use strict';

const express = require('express');
const DEFAULT_MIN_SUPPORTED_VERSION_CODE = 31;

/**
 * Endpoint public de verificare a versiunii GetFlow.
 * Returnează dacă instalarea curentă a clientului este învechită (isOutdated)
 * și dacă este necesară o actualizare obligatorie (forceUpdate).
 */
function createVersionCheckRouter({ config, versionLimiter }) {
  const router = express.Router();
  const defaultStoreUrl = 'https://play.google.com/store/apps/details?id=com.totsrl.getflo';
  const defaultMarketUrl = 'market://details?id=com.totsrl.getflo';

  const limiter = versionLimiter || ((_req, _res, next) => next());

  router.get('/version-check', limiter, (req, res) => {
    const minVersionCode = Number(process.env.APP_MIN_VERSION_CODE || config?.app?.minVersionCode || DEFAULT_MIN_SUPPORTED_VERSION_CODE);
    const latestVersionCode = Number(process.env.APP_LATEST_VERSION_CODE || config?.app?.latestVersionCode || 32);
    const latestVersionName = String(process.env.APP_LATEST_VERSION_NAME || config?.app?.latestVersionName || '1.0.0');
    const forceUpdateGlobal = String(process.env.APP_FORCE_UPDATE || 'false').toLowerCase() === 'true';

    const clientVersionCode = Number(req.query.versionCode || 0);
    const clientPlatform = String(req.query.platform || 'android').toLowerCase();

    // Verifică dacă versiunea e inferioară minimului sau dacă forțarea e globală
    const isOutdated = clientVersionCode > 0 && clientVersionCode < latestVersionCode;
    const isBelowMin = clientVersionCode > 0 && clientVersionCode < minVersionCode;
    const forceUpdate = isBelowMin || (forceUpdateGlobal && isOutdated);

    return res.status(200).json({
      minVersionCode,
      latestVersionCode,
      latestVersionName,
      forceUpdate,
      isOutdated,
      platform: clientPlatform,
      storeUrl: defaultStoreUrl,
      marketUrl: defaultMarketUrl,
      title: {
        ro: forceUpdate ? 'Actualizare obligatorie' : 'Actualizare disponibilă',
        en: forceUpdate ? 'Update Required' : 'Update Available',
        fr: forceUpdate ? 'Mise à jour requise' : 'Mise à jour disponible',
        de: forceUpdate ? 'Aktualisierung erforderlich' : 'Aktualisierung verfügbar',
      },
      message: {
        ro: forceUpdate
          ? 'O nouă versiune GetFlow este disponibilă cu îmbunătățiri importante. Pentru a continua, te rugăm să actualizezi aplicația din Google Play.'
          : 'O nouă versiune GetFlow este disponibilă cu îmbunătățiri AI și optimizări. Actualizează acum pentru cea mai bună experiență.',
        en: forceUpdate
          ? 'A new version of GetFlow is available with important improvements. Please update from Google Play to continue.'
          : 'A new version of GetFlow is available with AI improvements and optimizations.',
        fr: forceUpdate
          ? 'Une nouvelle version de GetFlow est disponible avec des améliorations importantes. Veuillez mettre à jour depuis Google Play pour continuer.'
          : 'Une nouvelle version de GetFlow est disponible avec des améliorations IA et des optimisations.',
        de: forceUpdate
          ? 'Eine neue Version von GetFlow ist mit wichtigen Verbesserungen verfügbar. Bitte aktualisieren Sie über Google Play, um fortzufahren.'
          : 'Eine neue Version von GetFlow ist mit KI-Verbesserungen und Optimierungen verfügbar.',
      },
      releaseNotes: {
        ro: 'Optimizări majore pentru analiza foto AI, stabilitate și performanță.',
        en: 'Major optimizations for AI photo analysis, stability, and performance.',
        fr: 'Optimisations majeures pour l\'analyse photo IA, la stabilité et les performances.',
        de: 'Wesentliche Optimierungen für KI-Fotoanalyse, Stabilität und Leistung.',
      },
    });
  });

  return router;
}

module.exports = createVersionCheckRouter;
