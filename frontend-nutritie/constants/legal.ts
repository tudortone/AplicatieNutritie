import { Alert, Linking } from 'react-native';

import { SUPPORT_EMAIL } from './support';
import { getLegalUrls } from '../lib/legalUrls';

/**
 * Configurare legală centralizată (TOT SRL / Operator GetFlow).
 * Datele comerciale suplimentare (CUI, Reg. Com., adresă publică, telefon public)
 * pot fi injectate opțional la build prin EXPO_PUBLIC_LEGAL_*.
 */
export const OPERATOR_DISPLAY_NAME_RO =
  process.env.EXPO_PUBLIC_LEGAL_COMPANY_NAME?.trim() ||
  process.env.EXPO_PUBLIC_LEGAL_OPERATOR_NAME?.trim() ||
  'TOT SRL';

export const OPERATOR_DISPLAY_NAME_EN =
  process.env.EXPO_PUBLIC_LEGAL_COMPANY_NAME?.trim() ||
  process.env.EXPO_PUBLIC_LEGAL_OPERATOR_NAME?.trim() ||
  'TOT SRL';

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
          'Vârsta minimă de utilizare: serviciul este destinat exclusiv persoanelor cu vârsta de cel puțin 16 ani (sau vârsta minimă legală pentru consimțământ digital aplicabilă în jurisdicția dvs.). Sunteți responsabil pentru confidențialitatea credențialelor de acces și utilizarea loială, non-abuzivă a platformei.',
        ],
      },
      {
        title: '3. Condiții comerciale, Abonamente, Taxe și Google Play Billing',
        paragraphs: [
          'GetFlow oferă abonamente opționale cu reînnoire automată (lunar — premium_monthly și anual — premium_annual, inclusiv eventuale perioade de probă gratuită afișate explicit în oferta Google Play) și pachete consumabile de Credite Flow.',
          'Toate plățile sunt procesate securizat prin contul dvs. Google Play la prețul și în moneda locală afișate înainte de confirmare. Acolo unde legislația fiscală o impune, Google Play acționează ca Merchant of Record și calculează, colectează și virează TVA sau taxele locale aplicabile.',
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
        title: '6. Legea aplicabilă și aplicabilitate internațională',
        paragraphs: [
          'Prezenții Termeni sunt guvernați de legislația din România și normele aplicabile ale Uniunii Europene (inclusiv GDPR și Regulamentul DSA 2022/2065), aplicându-se utilizatorilor din întreaga lume fără a limita drepturile imperative de protecție a consumatorilor din țara dvs. de reședință (SEE, Regatul Unit sau alte jurisdicții internaționale).',
          `Litigiile se soluționează pe cale amiabilă (${SUPPORT_EMAIL}), prin sesizarea Autorității Naționale pentru Protecția Consumatorilor (ANPC — ${ANPC_URL}), prin portalul european de soluționare a litigiilor (${EU_ODR_URL}) sau de instanțele competente.`,
        ],
      },
    ];
  }

  return [
    {
      title: '1. App Operator Identity',
      paragraphs: [
        `The GetFlow mobile application (com.totsrl.getflo) is developed and operated globally by ${operator}, based in ${OPERATOR_JURISDICTION_EN}.`,
        ...getTraderSummaryLines(lang).slice(1),
        'Verified trader contact details for EEA and international consumers are also displayed on the Google Play store listing developer section.',
      ],
    },
    {
      title: '2. Scope of Service & Minimum Age (16+)',
      paragraphs: [
        'GetFlow provides digital tools for nutrition logging, AI photo meal calorie analysis, macro tracking, interactive muscle workout tracking, and the GetFlow Coach AI assistant.',
        'Minimum age requirement: the service is strictly intended for individuals aged 16 or older (or the higher minimum age of digital consent required under applicable local law). You are responsible for safeguarding your account credentials and using the service lawfully.',
      ],
    },
    {
      title: '3. Commercial Terms, Taxes & Google Play Billing',
      paragraphs: [
        'GetFlow offers optional auto-renewing subscriptions (monthly — premium_monthly and annual — premium_annual, including any introductory or trial period displayed on the Google Play checkout sheet) as well as consumable Flow Credit packs.',
        'All payments are billed securely through your Google Play account at the exact price and local currency shown before purchase confirmation. Where required by local tax law, Google Play acts as Merchant of Record and handles VAT/sales tax calculation, collection, and remittance.',
        'Subscriptions automatically renew for the same duration and rate unless cancelled at least 24 hours prior to the end of the current billing cycle.',
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
      title: '6. Governing Law & Global Dispute Resolution',
      paragraphs: [
        'These Terms apply globally and are governed by the laws of Romania and applicable European Union law (including GDPR and the EU Digital Services Act), without limiting mandatory statutory consumer protections in your country of residence (EEA, UK, or other international jurisdictions).',
        `Unresolved disputes may be submitted amicably via ${SUPPORT_EMAIL}, to the Romanian National Authority for Consumer Protection (ANPC — ${ANPC_URL}), the EU Consumer Redress portal (${EU_ODR_URL}), or competent local courts.`,
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
        title: '1. Operatorul datelor & Aplicabilitate Globală',
        paragraphs: [
          `Operator de date: ${operator} — ${OPERATOR_JURISDICTION_RO}.`,
          `E-mail responsabil confidențialitate / GDPR: ${SUPPORT_EMAIL}${SUPPORT_PHONE ? ` | Telefon: ${SUPPORT_PHONE}` : ''}.`,
          'Aplicăm GDPR (Regulamentul UE 2016/679) și UK GDPR pentru utilizatorii din SEE/Regatul Unit și oferim drepturi echivalente de transparență, acces, portabilitate și ștergere utilizatorilor din toate țările.',
        ],
      },
      {
        title: '2. Ce date colectăm (16+ / Conform legii locale)',
        paragraphs: [
          'Serviciul este destinat persoanelor de cel puțin 16 ani (sau vârsta minimă legală pentru consimțământ digital din jurisdicția dvs.). Colectăm identificatori cont (e-mail, UID Supabase), profil fizic și obiective (vârstă, sex, înălțime, greutate, țintă calorică/macro), jurnal alimentar, fotografii cu mese pe ImageKit CDN, istoric antrenamente și date opționale Health Connect (doar READ_STEPS, procesată local).',
          'Informațiile de plată (card bancar) și taxele/TVA aferente sunt procesate exclusiv de Google Play Billing; GetFlow primește doar token-ul de achiziție și statusul abonamentului.',
        ],
      },
      {
        title: '3. Transferuri Internaționale & Procesatori Terți',
        paragraphs: [
          'Pentru operarea globală a serviciului colaborăm cu procesatori verificați sub DPA și Clauze Contractuale Standard (SCC) / EU-U.S. DPF: Supabase (bază de date UE Frankfurt), Google Cloud (Cloud Run europe-west3) și Gemini AI (inferență efemeră foto/text), Google AdMob & UMP (reclame cu consimțământ), Google Play Billing & Play Integrity (plăți și integritate), Sentry (telemetrie anonimizată PII, retenție max 90 de zile) și ImageKit CDN (stocare media mese).',
        ],
      },
      {
        title: '4. Drepturile dvs. Globale, Export & Ștergere cont',
        paragraphs: [
          `Indiferent de țara de reședință, aveți drept de acces, rectificare, portabilitate („Exportă datele mele” din Profil), opoziție și ștergere definitivă („Șterge contul” din Profil sau solicitare la ${SUPPORT_EMAIL} — ștergere ireversibilă în cel mult 30 de zile).`,
        ],
      },
    ];
  }

  return [
    {
      title: '1. Data Controller & Global Scope',
      paragraphs: [
        `Data Controller: ${operator} — ${OPERATOR_JURISDICTION_EN}.`,
        `Privacy & GDPR Contact: ${SUPPORT_EMAIL}${SUPPORT_PHONE ? ` | Phone: ${SUPPORT_PHONE}` : ''}.`,
        'We comply with EU GDPR (Regulation 2016/679) and UK GDPR for EEA/UK users and extend equivalent access, portability, and deletion protections to users worldwide.',
      ],
    },
    {
      title: '2. Data Categories & Minimum Age (16+)',
      paragraphs: [
        'GetFlow is intended for users aged 16 or older (or the applicable age of digital consent under local law). We process account identifiers (email, Supabase UID), fitness metrics and targets, food journal entries, meal photos stored on ImageKit CDN, workout logs, and optional read-only Health Connect step counts (READ_STEPS processed locally).',
        'Payment card details and applicable taxes/VAT are processed solely by Google Play Billing; GetFlow only receives purchase tokens and entitlement state.',
      ],
    },
    {
      title: '3. International Transfers & Subprocessors',
      paragraphs: [
        'To operate globally, data is processed via vetted subprocessors bound by Data Processing Addenda, EU-U.S. Data Privacy Framework, and Standard Contractual Clauses (SCCs): Supabase (EU Frankfurt database), Google Cloud (Cloud Run europe-west3) & Gemini AI (ephemeral meal/chat analysis), Google AdMob / UMP, Google Play Billing & Play Integrity, Sentry (PII-scrubbed diagnostics, 90-day max retention), and ImageKit CDN.',
      ],
    },
    {
      title: '4. Your Global Rights, Data Export & Deletion',
      paragraphs: [
        `Regardless of your country, you may access, export („Export my data”), correct, or permanently delete your account and associated meal photos anytime inside Profile → Data & Privacy, or by contacting ${SUPPORT_EMAIL} (permanent erasure within 30 calendar days).`,
      ],
    },
  ];
}
