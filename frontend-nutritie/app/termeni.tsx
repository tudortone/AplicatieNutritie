import React from 'react';
import { useTranslation } from 'react-i18next';

import { LegalDocumentScreen } from '../components/legal/LegalDocumentScreen';
import { getTermsSections } from '../constants/legal';

export default function TermsScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || i18n.language || 'ro';
  return (
    <LegalDocumentScreen
      docType="terms"
      title={t('legalScreen.termsTitle')}
      sections={getTermsSections(lang)}
      showSubscriptionShortcut
    />
  );
}
