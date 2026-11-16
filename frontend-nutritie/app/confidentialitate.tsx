import React from 'react';
import { useTranslation } from 'react-i18next';

import { LegalDocumentScreen } from '../components/legal/LegalDocumentScreen';
import { getPrivacySections } from '../constants/legal';

export default function PrivacyScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || i18n.language || 'ro';
  return (
    <LegalDocumentScreen
      docType="privacy"
      title={t('legalScreen.privacyTitle')}
      sections={getPrivacySections(lang)}
    />
  );
}
