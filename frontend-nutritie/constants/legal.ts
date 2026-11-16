import { Alert, Linking } from 'react-native';

import { SUPPORT_EMAIL } from './support';
import { getLegalUrls } from '../lib/legalUrls';

/**
 * Configurare legală centralizată (Dezvoltator Individual / Operator GetFlow).
 * Datele comerciale sau personale suplimentare (PFA/SRL, adresă publică, telefon public)
 * NU sunt stocate în codul sursă public; pot fi injectate opțional la build prin EXPO_PUBLIC_LEGAL_*.
 */
export const OPERATOR_DISPLAY_NAME_RO =
  process.env.EXPO_PUBLIC_LEGAL_COMPANY_NAME?.trim() ||
  process.env.EXPO_PUBLIC_LEGAL_OPERATOR_NAME?.trim() ||
  'Dezvoltator Individual (GetFlow)';

export const OPERATOR_DISPLAY_NAME_EN =
  process.env.EXPO_PUBLIC_LEGAL_COMPANY_NAME?.trim() ||
  process.env.EXPO_PUBLIC_LEGAL_OPERATOR_NAME?.trim() ||
  'Individual Developer (GetFlow)';

export const COMPANY_NAME = OPERATOR_DISPLAY_NAME_RO;

export const COMPANY_CUI: string | null =
  process.env.EXPO_PUBLIC_LEGAL_COMPANY_CUI?.trim() || null;

export const COMPANY_REG_COM: string | null =
  process.env.EXPO_PUBLIC_LEGAL_COMPANY_REG_COM?.trim() || null;

export const COMPANY_ADDRESS: string | null =
  process.env.EXPO_PUBLIC_LEGAL_COMPANY_ADDRESS?.trim() || null;

export { SUPPORT_EMAIL };

export const SUPPORT_PHONE: string | null =
  process.env.EXPO_PUBLIC_LEGAL_SUPPORT_PHONE?.trim() || null;

export const OPERATOR_JURISDICTION_RO = 'România, Uniunea Europeană';
export const OPERATOR_JURISDICTION_EN = 'Romania, European Union';

export const DEFAULT_PRODUCTION_TERMS_URL =
  'https://nutritie-backend-ai-435128681048.europe-west3.run.app/terms';

export const DEFAULT_PRODUCTION_PRIVACY_URL =
  'https://nutritie-backend-ai-435128681048.europe-west3.run.app/privacy';

export const TERMS_OF_SERVICE_URL =
  process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL?.trim() || DEFAULT_PRODUCTION_TERMS_URL;

export const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim() || DEFAULT_PRODUCTION_PRIVACY_URL;

export const MANAGE_SUBSCRIPTIONS_URL =
  'https://play.google.com/store/account/subscriptions';

export const ANPC_URL = 'https://anpc.ro';

export const EU_ODR_URL = 'https://consumer-redress.ec.europa.eu/';

export type LegalDocType = 'terms' | 'privacy' | 'accessibility';
export type LegalFallbackRoute = '/termeni' | '/confidentialitate';

export interface LegalSectionContent {
  title: string;
  paragraphs: string[];
}

export function getOperatorName(lang: string): string {
  return lang.startsWith('ro') ? OPERATOR_DISPLAY_NAME_RO : OPERATOR_DISPLAY_NAME_EN;
}

export function resolveLegalDocumentUrl(type: LegalDocType): string {
  try {
    const { termsUrl, privacyUrl } = getLegalUrls();
    if (type === 'terms') return termsUrl;
    if (type === 'privacy') return privacyUrl;
    return privacyUrl.replace(
      /\/politica-de-confidentialitate(?:\.html)?|\/privacy(?:\.html)?/,
      '/declaratie-accesibilitate.html',
    );
  } catch {
    if (type === 'terms') return TERMS_OF_SERVICE_URL;
    if (type === 'privacy') return PRIVACY_POLICY_URL;
    return PRIVACY_POLICY_URL.replace(
      /\/politica-de-confidentialitate(?:\.html)?|\/privacy(?:\.html)?/,
      '/declaratie-accesibilitate.html',
    );
  }
}

/**
 * Deschide un URL extern într-un wrapper try/catch sigur.
 */
export async function openExternalUrlSafe(
  url: string,
  errorAlert?: { title: string; message: string },
): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    if (errorAlert) {
      Alert.alert(errorAlert.title, errorAlert.message);
    }
    return false;
  }
}

/**
 * Încearcă deschiderea documentului legal extern; dacă URL-ul lipsește, utilizatorul este offline
 * sau browserul nu poate fi deschis, face fallback către ecranul intern din aplicație.
 */
export async function openLegalDocumentWithFallback(
  type: LegalDocType,
  navigateInternal?: (route: LegalFallbackRoute) => void,
  unavailableAlert?: { title: string; message: string },
): Promise<void> {
  const fallbackRoute: LegalFallbackRoute | null =
    type === 'terms' ? '/termeni' : type === 'privacy' ? '/confidentialitate' : null;

  try {
    const { termsUrl, privacyUrl } = getLegalUrls();
    let target = type === 'terms' ? termsUrl : privacyUrl;
    if (type === 'accessibility') {
      target = privacyUrl.replace(
        /\/politica-de-confidentialitate(?:\.html)?|\/privacy(?:\.html)?/,
        '/declaratie-accesibilitate.html',
      );
    }
    await Linking.openURL(target);
  } catch {
    if (fallbackRoute && navigateInternal) {
      navigateInternal(fallbackRoute);
      return;
    }
    if (unavailableAlert) {
      Alert.alert(unavailableAlert.title, unavailableAlert.message);
    }
  }
}

export function getTraderSummaryLines(lang: string): string[] {
  const isRo = lang.startsWith('ro');
  const operator = getOperatorName(lang);
  const lines = [
    isRo ? `Operator: ${operator}` : `Operator: ${operator}`,
    isRo ? `Jurisdicție: ${OPERATOR_JURISDICTION_RO}` : `Jurisdiction: ${OPERATOR_JURISDICTION_EN}`,
    isRo ? `E-mail suport oficial: ${SUPPORT_EMAIL}` : `Official Support Email: ${SUPPORT_EMAIL}`,
  ];
  const regParts = [COMPANY_CUI, COMPANY_REG_COM].filter(Boolean);
  if (regParts.length > 0) lines.splice(1, 0, regParts.join(' · '));
  if (COMPANY_ADDRESS) {
    lines.push(isRo ? `Adresă de contact: ${COMPANY_ADDRESS}` : `Contact address: ${COMPANY_ADDRESS}`);
  }
  if (SUPPORT_PHONE) {
    lines.push(isRo ? `Telefon suport: ${SUPPORT_PHONE}` : `Support phone: ${SUPPORT_PHONE}`);
  }
  return lines;
}

export function getTermsSections(lang: string): LegalSectionContent[] {
  const isRo = lang.startsWith('ro');
  const operator = getOperatorName(lang);

  if (isRo) {
    return [
      {
        title: '1. Identitatea Operatorului aplicației',
        paragraphs: [
          `Aplicația mobilă GetFlow (com.totsrl.getflo) este dezvoltată și operată de către ${operator}, cu sediul în ${OPERATOR_JURISDICTION_RO}.`,
          ...getTraderSummaryLines(lang).slice(1),
          'Datele oficiale de contact ale dezvoltatorului pentru utilizatorii din SEE sunt disponibile și în secțiunea de detalii a dezvoltatorului din Google Play.',
        ],
      },
      {
        title: '2. Obiectul serviciului și regulile de utilizare',
        paragraphs: [
          'GetFlow oferă instrumente digitale pentru jurnal nutrițional, scanare foto AI a meselor, calcul caloric și de macronutrienți, monitorizarea antrenamentelor pe hartă musculară și asistentul conversațional GetFlow Coach.',
          'Serviciul este destinat exclusiv persoanelor cu vârsta de cel puțin 18 ani. Sunteți responsabil pentru confidențialitatea credențialelor de acces și utilizarea loială, non-abuzivă a platformei.',
        ],
      },
      {
        title: '3. Condiții comerciale, Abonamente și Plăți (Google Play Billing)',
        paragraphs: [
          'GetFlow oferă abonamente opționale cu reînnoire automată (lunar — premium_monthly și anual — premium_annual) și pachete consumabile de Credite Flow.',
          'Toate plățile sunt procesate securizat prin Google Play Billing la prețul și moneda afișate înainte de confirmarea tranzacției.',
          'Abonamentele se reînnoiesc automat pentru aceeași durată și la același tarif dacă nu sunt anulate cu cel puțin 24 de ore înainte de expirarea perioadei curente.',
          'Gestionare și anulare: puteți administra sau anula oricând abonamentul din Google Play Store → Profil → Plăți și abonamente → Abonamente, ori direct la adresa https://play.google.com/store/account/subscriptions.',
        ],
      },
      {
        title: '4. Politica de rambursare și Dreptul de retragere (OUG 34/2014)',
        paragraphs: [
          'Conform OUG nr. 34/2014 și Directivei (UE) 2011/83/UE, consumatorii din SEE beneficiază în principiu de un drept legal de retragere în termen de 14 zile calendaristice de la încheierea contractului la distanță.',
          'Excepția conținutului digital (Art. 16 lit. m din OUG 34/2014): prin confirmarea achiziției în Google Play, accesul la beneficiile Premium sau Creditele Flow digitale (nelivrate pe suport material) începe imediat cu acordul prealabil expres al utilizatorului, motiv pentru care dreptul de retragere încetează odată cu activarea furnizării digitale.',
          `Solicitările de rambursare eligibile (erori tehnice, tranzacții neautorizate sau cazuri prevăzute de lege) sunt procesate conform politicilor oficiale Google Play sau ne pot fi adresate la ${SUPPORT_EMAIL}.`,
        ],
      },
      {
        title: '5. Limitarea răspunderii și Disclaimer Medical / AI',
        paragraphs: [
          'GetFlow NU este dispozitiv medical și NU furnizează recomandări medicale, diagnostice sau tratamente clinice.',
          'Estimările calorice, analizele foto Gemini AI și recomandările generate de GetFlow Coach au caracter exclusiv informativ și educațional. Consultați un medic sau nutriționist autorizat înainte de a modifica regimul alimentar sau programul sportiv.',
        ],
      },
      {
        title: '6. Legea aplicabilă și soluționarea litigiilor',
        paragraphs: [
          'Prezenții Termeni sunt guvernați de legislația din România și normele aplicabile ale Uniunii Europene (inclusiv GDPR și Regulamentul DSA 2022/2065), fără a aduce atingere normelor imperative de protecție a consumatorilor din țara dvs. de reședință.',
          `Litigiile se soluționează pe cale amiabilă (${SUPPORT_EMAIL}), prin sesizarea Autorității Naționale pentru Protecția Consumatorilor (ANPC — ${ANPC_URL}), prin portalul european de soluționare a litigiilor (${EU_ODR_URL}) sau de instanțele competente.`,
        ],
      },
    ];
  }

  return [
    {
      title: '1. App Operator Identity',
      paragraphs: [
        `The GetFlow mobile application (com.totsrl.getflo) is developed and operated by ${operator}, based in ${OPERATOR_JURISDICTION_EN}.`,
        ...getTraderSummaryLines(lang).slice(1),
        'Verified trader contact details for EEA consumers are also displayed on the Google Play store listing developer section.',
      ],
    },
    {
      title: '2. Scope of Service & Account Rules',
      paragraphs: [
        'GetFlow provides digital tools for nutrition logging, AI photo meal calorie analysis, macro tracking, interactive muscle workout tracking, and the GetFlow Coach AI assistant.',
        'The service is strictly intended for users aged 18 or older. You are responsible for safeguarding your account credentials and using the service lawfully.',
      ],
    },
    {
      title: '3. Commercial Terms, Subscriptions & Google Play Billing',
      paragraphs: [
        'GetFlow offers optional auto-renewing subscriptions (monthly — premium_monthly and annual — premium_annual) as well as consumable Flow Credit packs.',
        'All purchases are billed securely through Google Play Billing at the exact price and currency displayed before purchase confirmation.',
        'Subscriptions automatically renew unless cancelled at least 24 hours prior to the end of the current billing cycle.',
        'You can manage or cancel your subscription anytime directly via Google Play Store → Profile → Payments & subscriptions → Subscriptions, or at https://play.google.com/store/account/subscriptions.',
      ],
    },
    {
      title: '4. Refunds & Right of Withdrawal (EU Directive 2011/83/EU & RO GEO 34/2014)',
      paragraphs: [
        'Under EU consumer law (Directive 2011/83/EU and Romanian GEO 34/2014), EEA consumers generally have a 14-day right of withdrawal for distance contracts.',
        'Digital Content Exception (Art. 16(m)): By confirming your digital subscription or Flow Credits purchase in Google Play, performance begins immediately with your prior express consent and acknowledgment that you thereby lose the statutory right of withdrawal once digital delivery starts.',
        `Eligible refund requests are handled under Google Play Refund Policies or via support at ${SUPPORT_EMAIL}.`,
      ],
    },
    {
      title: '5. Limitation of Liability, Medical & AI Disclaimer',
      paragraphs: [
        'GetFlow is an informational wellness and fitness tool, NOT a medical device. Nutritional estimates, photo scans, and GetFlow Coach AI outputs do not constitute medical advice, diagnosis, or treatment.',
        'Always consult a qualified healthcare professional before starting any diet or exercise program.',
      ],
    },
    {
      title: '6. Governing Law & Dispute Resolution',
      paragraphs: [
        'These Terms are governed by the laws of Romania and applicable European Union law (including GDPR and the EU Digital Services Act), without limiting mandatory consumer rights in your EEA/UK jurisdiction.',
        `Unresolved disputes may be submitted amicably via ${SUPPORT_EMAIL}, to the Romanian National Authority for Consumer Protection (ANPC — ${ANPC_URL}), the EU Consumer Redress portal (${EU_ODR_URL}), or competent courts.`,
      ],
    },
  ];
}

export function getPrivacySections(lang: string): LegalSectionContent[] {
  const isRo = lang.startsWith('ro');
  const operator = getOperatorName(lang);
  if (isRo) {
    return [
      {
        title: '1. Operatorul datelor & Contact',
        paragraphs: [
          `Operator: ${operator} — ${OPERATOR_JURISDICTION_RO}.`,
          `E-mail responsabil confidențialitate / GDPR: ${SUPPORT_EMAIL}${SUPPORT_PHONE ? ` | Telefon: ${SUPPORT_PHONE}` : ''}.`,
        ],
      },
      {
        title: '2. Ce date colectăm (Exclusiv 18+)',
        paragraphs: [
          'Identificatori cont (e-mail, UID Supabase), profil fizic și obiective (vârstă, sex, înălțime, greutate, țintă calorică/macro), jurnal alimentar, fotografii cu mese stocate pe ImageKit CDN, istoric antrenamente și date opționale Health Connect (doar permisiunea READ_STEPS, procesată local).',
          'Informațiile de plată (card bancar) sunt procesate exclusiv de Google Play Billing; GetFlow primește doar token-ul de achiziție și statusul abonamentului.',
        ],
      },
      {
        title: '3. Drepturile dvs., Export & Ștergere cont',
        paragraphs: [
          `În temeiul GDPR (Regulamentul UE 2016/679), aveți drept de acces, rectificare, portabilitate („Exportă datele mele” din Profil), opoziție și ștergere definitivă („Șterge contul” din Profil sau solicitare la ${SUPPORT_EMAIL} — ștergere ireversibilă în cel mult 30 de zile).`,
          'Raportările tehnice Sentry elimină automat datele PII și sunt păstrate maximum 90 de zile.',
        ],
      },
    ];
  }

  return [
    {
      title: '1. Data Controller & Contact',
      paragraphs: [
        `Data Controller: ${operator} — ${OPERATOR_JURISDICTION_EN}.`,
        `Privacy & GDPR Contact: ${SUPPORT_EMAIL}${SUPPORT_PHONE ? ` | Phone: ${SUPPORT_PHONE}` : ''}.`,
      ],
    },
    {
      title: '2. Data Categories Processed (18+ Only)',
      paragraphs: [
        'Account identifiers (email, Supabase UID), fitness metrics and targets, food journal entries, meal photos stored securely on ImageKit CDN, workout logs, and optional read-only Health Connect step counts (READ_STEPS processed locally on device).',
        'Payment card details are processed solely by Google Play Billing; GetFlow only verifies purchase tokens and entitlement state.',
      ],
    },
    {
      title: '3. Your GDPR Rights, Data Export & Deletion',
      paragraphs: [
        `You can export your personal data or permanently delete your account and associated meal photos anytime inside Profile → Data & Privacy, or by contacting ${SUPPORT_EMAIL} (erasure completed within 30 calendar days).`,
      ],
    },
  ];
}
