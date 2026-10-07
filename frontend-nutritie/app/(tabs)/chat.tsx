
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Image,
  ScrollView, Keyboard, Alert, Modal, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildApiUrl } from '@/lib/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusRefresh } from '../../hooks/useFocusRefresh';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Send, Sparkles, RotateCcw, BarChart3, Dumbbell, ChefHat, RefreshCw, X, Utensils } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useMeseAzi } from '../../hooks/useMeseAzi';
import { useCurrentDayKey } from '../../hooks/useCurrentDayKey';
import { useTranslation } from 'react-i18next';
// REMED-002: instanța i18next pentru traduceri în funcții de nivel modul
// (cerePropunereMasa), unde rulează fără hook.
import i18n from '../../i18n';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useAds } from '../../context/AdsContext';
import BouncingDot from '../../components/BouncingDot';
import { RecipeGeneratorModal } from '../../components/RecipeGeneratorModal';
import { supabase } from '../../supabase';
import { ConfirmSheet } from '../../components/ui/ConfirmSheet';
import { construiesteRinduriMasaChat, decideRezultatInsertMasa, type DecizieInsertMasa } from '../../lib/payloadMese';
import { idOperatieNoua } from '../../lib/idUtils';
import { pushOfflineMealVerificat, type MasaOfflinePayload } from '../../lib/offlineQueue';
import { marcheazaMeseModificate } from '../../lib/freshnessMese';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import KeyboardAwareScreen from '@/components/ui/KeyboardAwareScreen';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { parseMealProposal, extractTextWithoutMealProposal, formatMealProposalForChat, containsStructuredMealProtocol, type MealProposal } from '../../lib/parseMealProposal';
import { MealSaveSuccessModal, type MealSuccessData } from '../../components/ui/MealSaveSuccessModal';
import { FlowIcon } from '../../components/ui/FlowIcon';
// REMED-006: categoriile de masă aparțin lib/mealUtils (read-only) — aici doar le citim;
// eticheta tradusă o derivăm noi din id (clés chat.mealCategory.*), nu din label-ul RO fix.
import { MEAL_CATEGORIES, CATEGORIE_ICONA } from '../../lib/mealUtils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { Masa, TipMasa } from '../../types';
import { calculeazaTotaluriZi, totaluriPentruAfisare } from '../../lib/nutritionTotals';
import type { ThemeColors } from '../../constants/theme';

// Generator de id stabil pentru mesajele de chat (folosit ca `key` in lista).
const newMsgId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Timeout-ul clientului pentru cererile AI. Fara el, un raspuns server lent
// (ex. tot lantul de fallback Gemini) tinea butonul de trimitere blocat la nesfarsit.
// CHAT-006: 160s — peste bugetul de procesare al serverului (~125-155s), ca un
// raspuns AI lent legitim sa nu fie taiat de client inainte de timp.
const AI_REQUEST_TIMEOUT_MS = 160000;

interface ChatMessage {
  // FIX UI: fara id stabil, key={index} facea Reanimated sa reutilizeze bula
  // gresita la inserarea unui mesaj (animatii care sar, text amestecat).
  id?: string;
  role: 'ai' | 'user' | string;
  text: string;
  // CHAT-008b: bulele de eroare (mesaje-placeholder de tip AI) sunt marcate cu
  // isError ca sa fie EXCLUSE din istoricul trimis catre model — altfel AI-ul
  // „invata" textul propriilor mesaje de eroare ca si cum le-ar fi spus el.
  isError?: boolean;
  // REMED-027: timpul randarii (ora:min), afisat subtil sub bula. Absent la
  // mesajele restaurate din istoric (randare optionala, fara efect in lista).
  time?: string;
}

// REMED-027: bulă nouă cu timestamp (ora:min) local, generat la creare.
function buleMesaj(rol: string, text: string, isError = false): ChatMessage {
  return {
    id: newMsgId(),
    role: rol,
    text,
    isError,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

// Hash determinist FNV-1a 32-bit -> hex. Suficient pentru idempotență (cheia nu
// trebuie să fie criptografică; trebuie doar să fie stabilă pentru același corp
// de cerere și distinctă pentru corpuri diferite).
function hashString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// CHAT-001: cheie de idempotență stabilă per „mesaj + istoric trimis". Backend-ul
// (utils/idempotency.js) reia răspunsul anterior doar dacă amprenta corpului se
// potrivește; de aceea hash-ul include și istoricul, nu doar mesajul — altfel un
// retry după ce istoricul a crescut ar primi 409 IDEMPOTENCY_KEY_REUSED.
function cheieIdempotenta(mesaj: string, mesaje: ChatMessage[], userId?: string): string {
  const amprenta = mesaje.map(m => `${m.role}:${m.text}`).join('|');
  return hashString(`${userId || 'anon'}|${mesaj}|${amprenta}`);
}

/**
 * Rută dedicată de meal-intent, invocată ÎNAINTE de POST /chat.
 * POST către "/api/log-food-from-chat" cu Authorization Bearer + JSON { mesaj },
 * apoi parsează răspunsul server (format MEAL_PROPOSAL).
 * Aruncă la status != 2xx sau dacă răspunsul nu conține o propunere validă.
 */
async function cerePropunereMasa(mesaj: string, accessToken: string, signal?: AbortSignal): Promise<MealProposal> {
  const response = await fetch(buildApiUrl('/log-food-from-chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      // CHAT-001: același mesaj de masă retrimis = aceeași cheie => backend-ul
      // reia propunerea anterioară, nu regenerează (fără dublă execuție/credit).
      'Idempotency-Key': hashString(mesaj),
    },
    signal,
    body: JSON.stringify({ mesaj, limba: i18n.language || 'ro' }),
  });

  if (!response.ok) {
    let statusText: string | null = null;
    try {
      const erori = await response.json();
      statusText = erori?.eroare || erori?.message || erori?.raspun || null;
    } catch {
      // Corpul de eroare nu e JSON; folosim mesajul generic dedesubt.
    }
    throw new Error(
      statusText || i18n.t('chat.errorProposalServer', { status: response.status }),
    );
  }

  let date: any = null;
  try {
    date = await response.json();
  } catch {
    date = null;
  }

  const propunere = parseMealProposal(date) || parseMealProposal(date?.raspuns);
  if (!propunere || propunere.type !== 'MEAL_PROPOSAL') {
    throw new Error(i18n.t('chat.errorProposalInvalid'));
  }
  return propunere;
}

interface ChatMessageListProps {
  messages: ChatMessage[];
  colors: ThemeColors;
  loadingChat: boolean;
  onRetryLast: () => void;
}

// REMED-017: lista de bule extrasă în componentă proprie + React.memo. La fiecare
// tastatură (chatInput) doar ChatScreen se re-randează; lista primește aceleași
// referințe (messages array neschimbat, onRetryLast stabil) și rimane nere-randată.
// „NO components inside components": ChatMessageList e declarată la nivel de modul.
const ChatMessageList = React.memo(function ChatMessageList({
  messages,
  colors,
  loadingChat,
  onRetryLast,
}: ChatMessageListProps) {
  const { t } = useTranslation();
  return (
    <>
      {messages.map((msg, index) => (
        <Animated.View
          key={msg.id ?? `msg-${index}`}
          entering={FadeIn.duration(400)}
          style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}
        >
          {msg.role !== 'user' && (
            <Text maxFontSizeMultiplier={1.3} style={[styles.aiBubbleLabel, { color: colors.textTertiary }]}>
              {t('chat.coachLabel')}
            </Text>
          )}
          {msg.role === 'user' ? (
            <LinearGradient colors={colors.accentGradient} style={styles.bubbleContentUser}>
              <Text maxFontSizeMultiplier={1.4} style={[styles.textUser, { color: colors.background }]}>{msg.text}</Text>
              {msg.time ? (
                <Text maxFontSizeMultiplier={1.3} style={[styles.bubbleTime, { color: colors.background + '99' }]}>{msg.time}</Text>
              ) : null}
            </LinearGradient>
          ) : (
            <View style={[styles.bubbleContentAI, { borderColor: colors.accentSecondary + '40', backgroundColor: colors.surface }]}>
              <LinearGradient colors={[colors.accentSecondary + '26', 'rgba(0,0,0,0.3)']} style={styles.bubbleContentAIGrad}>
                <Text maxFontSizeMultiplier={1.4} style={[styles.textAI, { color: colors.textPrimary }]}>{msg.text}</Text>
                {msg.isError ? (
                  // REMED-026: retry reinstalează ULTIMUL mesaj de utilizator (nu se
                  // ia textul erorii). Guard idempotența rămâne în executaTrimitereMesaj.
                  <TouchableOpacity
                    onPress={onRetryLast}
                    style={[styles.retryBtn, { borderColor: colors.accentSecondary + '66' }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.retry')}
                    hitSlop={6}
                  >
                    <RefreshCw size={13} color={colors.textPrimary} />
                    <Text maxFontSizeMultiplier={1.3} style={[styles.retryBtnText, { color: colors.textPrimary }]}>{t('chat.retry')}</Text>
                  </TouchableOpacity>
                ) : null}
                {msg.time ? (
                  <Text maxFontSizeMultiplier={1.3} style={[styles.bubbleTime, { color: colors.textSecondary }]}>{msg.time}</Text>
                ) : null}
              </LinearGradient>
            </View>
          )}
        </Animated.View>
      ))}

      {loadingChat && (
        <Animated.View entering={FadeInDown.duration(300)} style={[styles.bubble, styles.bubbleAI]}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.aiBubbleLabel, { color: colors.textTertiary }]}>{t('chat.coachLabel')}</Text>
          <View style={[styles.bubbleContentAI, { borderColor: colors.accentSecondary + '40', backgroundColor: colors.surface }]}>
            <LinearGradient colors={[colors.accentSecondary + '26', 'rgba(0,0,0,0.3)']} style={styles.bubbleContentAIGrad}>
              <View style={styles.typingRow}>
                <BouncingDot delay={0} color={colors.accentSecondary} />
                <BouncingDot delay={150} color={colors.accentSecondary} />
                <BouncingDot delay={300} color={colors.accentSecondary} />
              </View>
            </LinearGradient>
          </View>
        </Animated.View>
      )}
    </>
  );
});

const isMealLogIntent = (text: string) => {
  const lower = text.toLowerCase().trim();
  // Aliniat cu regex-ul din backend (/api/chat) pentru suport multilingv (RO, EN, FR, DE):
  return /(?:am m[aâ]ncat|am consumat|am servit|am b[aă]ut|logheaz[aă]|[iî]nregistreaz[aă]|pune [iî]n jurnal|adaug[aă] [iî]n jurnal|adaug[aă] masa|salveaz[aă] masa|i ate|i had|i drank|log meal|add to diary|log food|record meal|add meal|j'ai mang[eé]|j'ai bu|enregistre|ajouter au journal|ich habe gegessen|ich habe getrunken|mahlzeit loggen|zum tagebuch hinzuf[uü]gen)(?=[\s.,!?;:'"()[\]{}]|$)/iu.test(lower);
};

export default function ChatScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { session } = useAuth();
  const router = useRouter();
  const { recordChatUserMessage, maybeShowInterstitial } = useAds();
  const [successModalData, setSuccessModalData] = useState<MealSuccessData | null>(null);
  const currentDayKey = useCurrentDayKey();
  const insets = useSafeAreaInsets();
  const { tabBarHeight } = useResponsiveLayout();
  const reduceMotion = useReducedMotion();
  const [chatInput, setChatInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [recipeModalVisible, setRecipeModalVisible] = useState(false);
  const [newChatModalVisible, setNewChatModalVisible] = useState(false);
  const [showNewChatBanner, setShowNewChatBanner] = useState(false);
  const [mealProposal, setMealProposal] = useState<MealProposal | null>(null);
  const [mealProposalVisible, setMealProposalVisible] = useState(false);
  const [savingProposal, setSavingProposal] = useState(false);
  const [mesaje, setMesaje] = useState<ChatMessage[]>([
    buleMesaj('ai', t('chat.welcome'))
  ]);
  // BUG-058: plafon de retenție a istoricului — se păstrează ULTIMELE 300 de
  // mesaje. BUG-039 eliminase cap-ul vechi de 50 (conversațiile lungi pierdeau
  // primele mesaje la reîncărcare); pragul de aici e de 6× mai mare și taie
  // DOAR din față (cele mai vechi), doar când o zi depășește 300 de mesaje.
  // O zi normală de chat e mult sub prag, deci BUG-039 rămâne acoperit. Fără
  // plafon, array-ul și scrierea AsyncStorage ar crește nelimitat (creștere
  // necontrolată de memorie + stocare).
  const MAX_CHAT_HISTORY = 300;
  const cuPlafon = (lista: ChatMessage[]): ChatMessage[] =>
    lista.length > MAX_CHAT_HISTORY ? lista.slice(lista.length - MAX_CHAT_HISTORY) : lista;
  const adaugaMesaj = (m: ChatMessage) => {
    setMesaje((prev) => cuPlafon([...prev, m]));
  };
  // REMED-006: categoria aleasă explicit de utilizator înainte de a insera
  // propunerea (null => confirmarea rămâne blocată; fără auto-insert).
  const [proposalCategory, setProposalCategory] = useState<TipMasa | null>(null);
  const handleSuccessDismiss = useCallback(() => {
    setSuccessModalData(null);
    router.replace('/(tabs)');
  }, [router]);
  // P1-01: identitatea acțiunii „Adaugă în jurnal" din chat.
  const idOperatieSalvareRef = useRef<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const mesajeRef = useRef(mesaje);
  // CHAT-002: controller-ul cererii AI active — pentru abort la unmount.
  const activeRequestRef = useRef<AbortController | null>(null);
  // CHAT-003: oglinda sincronă a loadingChat, fiabilă chiar și între două
  // render-uri (loadingChat din closure e învechit până la următorul render).
  const loadingRef = useRef(false);

  useEffect(() => {
    mesajeRef.current = mesaje;
  }, [mesaje]);
  
  const { 
    totalCalorii, 
    caloriiTinta, 
    totalProteine, 
    proteineTinta, 
    refresh 
  } = useMeseAzi();

  useFocusRefresh(
    useCallback(() => {
      refresh();
    }, [refresh]),
    5000,
    [refresh]
  );

  const params = useLocalSearchParams<{ prompt?: string }>();
  useEffect(() => {
    if (params?.prompt && typeof params.prompt === 'string' && params.prompt.trim()) {
      setChatInput(params.prompt);
    }
  }, [params?.prompt]);

  // BUG-006: istoricul chat-ului e separat per zi locala (chat_history_<uid>_<zi>).
  // Fara granita de zi, conversatia de ieri aparea in fata utilizatorului azi, iar
  // key-ul instabil fara data + deps [] creau un race care putea incarca istoricul
  // gresit (anon vs user) si chiar sa-l suprascrie.
  const getChatStorageKey = useCallback(() => {
    const userId = session?.user?.id || 'anon';
    return `chat_history_${userId}_${currentDayKey}`;
  }, [session?.user?.id, currentDayKey]);

  // Cheia zilei/sesiunii la care apartin mesajele afisate in prezent. La rotirea
  // miezului noptii, mesajele vechi nu mai trebuie salvate sub cheia zilei noi.
  const mesajeKeyRef = useRef<string | null>(null);

  // Migrare unica + incarcare istoric. Deps pe [session, currentDayKey] repara
  // race-ul de la deps []: istoricul se (re)incarca la login/logout si se roteste
  // la o zi noua (zi noua fara istoric = mesaj de bun venit, nu istoricul vechi).
  useEffect(() => {
    const userId = session?.user?.id || 'anon';
    const storageKey = `chat_history_${userId}_${currentDayKey}`;
    const legacyKey = `chat_history_${userId}`;
    let activ = true;

    (async () => {
      // Migrare idempotenta: cheia veche fara zi (versiunile pre-update) se muta
      // in cheia zilei curente o singura data, ca istoricul sa nu se piarda.
      try {
        const [legacy, dayVal] = await Promise.all([
          AsyncStorage.getItem(legacyKey),
          AsyncStorage.getItem(storageKey),
        ]);
        if (legacy && !dayVal) {
          await AsyncStorage.setItem(storageKey, legacy);
        }
        if (legacy) {
          await AsyncStorage.removeItem(legacyKey);
        }
      } catch {
        // migrare necritica; istoricul vechi ramane daca nu putem muta.
      }

      if (!activ) return;
      try {
        const saved = await AsyncStorage.getItem(storageKey);
        let parsed: ChatMessage[] | null = null;
        if (saved) {
          try {
            const p = JSON.parse(saved);
            if (Array.isArray(p) && p.length > 0) parsed = p;
          } catch {
            parsed = null;
          }
        }
        if (parsed && parsed.length > 0) {
          // BUG-058: istoricul salvat dinainte de plafon poate fi oricât de lung
          // — îl tăiem la încărcare ca să nu realimenteze creșterea nelimitată.
          setMesaje(cuPlafon(parsed));
          mesajeKeyRef.current = storageKey;
        } else if (mesajeKeyRef.current !== storageKey) {
          // zi/sesiune noua fara istoric salvat -> pornim curat.
          setMesaje([
            buleMesaj('ai', t('chat.welcome'))
          ]);
          mesajeKeyRef.current = storageKey;
        }
      } catch (e) {
        console.error('Eroare la încărcarea istoricului chat:', e);
      }
    })();

    return () => { activ = false; };
  }, [session?.user?.id, currentDayKey, t]);

  // Salvare istoric debounce-uită (800ms): la mesaje succesive rapide scriem o
  // singură dată în AsyncStorage, iar la unmount golitm orice salvare restantă.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (mesaje.length <= 1) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const key = mesajeKeyRef.current ?? getChatStorageKey();
      // BUG-039+BUG-058: istoricul zilei se salvează INTEGRAL, cu plafonul de
      // retenție aplicat deja pe `mesaje` (últimele 300) — BUG-039: conversațiile
      // lungi nu mai pierd primele mesaje (prag de 50 era prea mic); BUG-058:
      // scrierea e mărginită (fără creștere necontrolată) și debounce-ul de 800ms
      // împiedică rescrierea întregului istoric la fiecare mesaj.
      AsyncStorage.setItem(key, JSON.stringify(mesaje)).catch((e) =>
        console.error('Eroare la salvarea istoricului chat:', e),
      );
    }, 800);
  }, [mesaje, getChatStorageKey]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        const restant = mesajeRef.current;
        if (restant.length > 1) {
          const key = mesajeKeyRef.current ?? getChatStorageKey();
          AsyncStorage.setItem(key, JSON.stringify(restant)).catch((e) =>
            console.error('Eroare la salvarea istoricului chat:', e),
          );
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CHAT-002: la părăsirea ecranului anulăm cererea AI în zbor. Serverul vede
  // deconectarea (close) și nu mai continuă generarea/facturarea; pe client nu se
  // mai încearcă setState pe o componentă demontată.
  useEffect(() => {
    return () => {
      activeRequestRef.current?.abort();
    };
  }, []);

  // PERF-009: nu derulăm la fiecare re-render — doar când ultimul mesaj s-a
  // schimbat efectiv (id nou). Toggle-ul de loadingChat fără mesaj nou nu mai
  // provoacă scroll redundent; orice mesaj nou schimbă totuși ultimul id.
  const lastScrolledMsgIdRef = useRef<string | null>(null);
  useEffect(() => {
    const lastId = mesaje[mesaje.length - 1]?.id ?? null;
    if (lastId === lastScrolledMsgIdRef.current) return;
    lastScrolledMsgIdRef.current = lastId;
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 200);
  }, [mesaje, loadingChat]);


  const executaTrimitereMesaj = async (mesajText: string, esteRetry = false) => {
    // CHAT-003: gardă anti-concurență la nivelul întregii funcții — acoperă
    // trimitePromptDirect, chip-urile rapide, generatorul de rețete și input-ul.
    // Fără ea se lansa o a doua cerere /chat în timp ce prima era în zbor
    // (răspunsuri în ordine inversă, dublu credit).
    if (loadingRef.current) return;
    if (!mesajText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // BUG-061: la retry (esteRetry=true) bulele de utilizator există deja în
    // istoric — nu o adăugăm încă o dată, altfel retrimiterea ar duplica bulele.
    if (!esteRetry) {
      recordChatUserMessage();
      adaugaMesaj(buleMesaj('user', mesajText));
    }
    setLoadingChat(true);
    loadingRef.current = true;

    if (!session) {
      adaugaMesaj(buleMesaj('ai', t('chat.errorNotAuthed'), true));
      setLoadingChat(false);
      loadingRef.current = false;
      return;
    }

    const controller = new AbortController();
    activeRequestRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

    try {
      // Meal-intent ESTE rutat direct catre propunerea de masa ANT de a ajunge la
      // /chat general. Persistarea ramane la confirmarea explicita a utilizatorului
      // (confirmMealProposal); aici doar obtinem propunerea si o afisam.
      if (isMealLogIntent(mesajText)) {
        try {
          const propunere = await cerePropunereMasa(mesajText, session.access_token, controller.signal);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setMealProposal(propunere);
          setProposalCategory(null); // REMED-006: categorie curată la fiecare propunere nouă.
          setMealProposalVisible(true);
          adaugaMesaj(buleMesaj('ai', t('chat.foodsIdentified')));
          return;
        } catch (errMeal) {
          const mesajEroareMasa = errMeal instanceof Error ? errMeal.message : null;
          console.warn('Eroare rută dedicată de masă:', mesajEroareMasa || errMeal);
          adaugaMesaj(buleMesaj('ai', mesajEroareMasa || t('chat.errorMealProposal'), true));
          return;
        }
      }

      // CHAT-007: istoricul trimis spre server se trunchiază la ultimele 20 de
      // mesaje — fără cap, o conversație lungă depășea limita de corp a
      // express.json. CHAT-008b: bulele de eroare (isError) nu intră în
      // contextul AI — modelul nu trebuie să „învețe" textul propriilor erori.
      const istoricActivat = [
        ...mesajeRef.current.filter((m) => !m.isError),
        { role: 'user' as const, text: mesajText },
      ].slice(-20);
      // CHAT-001: aceeași întrebare cu același istoric trimisă din nou (retry după
      // timeout) primește răspunsul înregistrat, nu o a doua generare/facturare.
      const cheieIdempotentaChat = cheieIdempotenta(mesajText, istoricActivat, session.user?.id);
      const raspuns = await fetch(buildApiUrl('/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'Idempotency-Key': cheieIdempotentaChat,
        },
        signal: controller.signal,
        body: JSON.stringify({
          mesaj: mesajText,
          mesaje: istoricActivat,
          caloriiConsumate: totalCalorii,
          caloriiTinta,
          proteineConsumate: totalProteine,
          proteineTinta,
          limba: i18n.language || 'ro'
        }),
      });
      let date: any = null;
      try {
        date = await raspuns.json();
      } catch {
        date = null;
      }

      // CHAT-008a: 2xx cu corp non-JSON — mesaj clar, nu „Eroare la procesarea
      // răspunsului." (care sugera greșit o problemă internă a AI-ului).
      if (raspuns.ok && date === null) {
        adaugaMesaj(buleMesaj('ai', t('chat.errorInvalidResponse'), true));
        return;
      }

      if (!raspuns.ok) {
        // Statusurile non-2xx se mapau pe mesaje clare; altfel un 401/429/500
        // apărea ca un răspuns AI normal ("Eroare la procesarea răspunsului.").
        const mesajServer = date?.raspuns || date?.eroare || date?.message;
        let textEroare: string;
        if (raspuns.status === 401) {
          textEroare = t('chat.errorSessionExpired');
        } else if (raspuns.status === 429) {
          textEroare = mesajServer || t('chat.errorRateLimit');
        } else {
          textEroare = mesajServer || t('chat.errorServer');
        }
        adaugaMesaj(buleMesaj('ai', textEroare, true));
        return;
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      let raspunsText = date?.raspuns || t('chat.errorResponseProcessing');
      const parsed = parseMealProposal(date) || parseMealProposal(raspunsText);

      // P1-02: 200 OK cu corp MALFORMAT (fără `raspuns` și fără propunere
      // interpretabilă) NU este un tur reușit. Înainte, textul de eroare era
      // afișat ca o bulă normală de asistent și se evalua și reclama — adică un
      // eșec arăta exact ca un răspuns complet.
      if (!date?.raspuns && !parsed) {
        adaugaMesaj(buleMesaj('ai', t('chat.errorResponseProcessing'), true));
        return;
      }

      if (parsed && (parsed.type === 'MEAL_PROPOSAL' || Array.isArray(parsed.items))) {
        if (Array.isArray(parsed.items)) parsed.type = 'MEAL_PROPOSAL';
        setMealProposal(parsed);
        setProposalCategory(null);
        // Păstrăm explicația și pașii rețetei, eliminând doar blocul tehnic JSON
        const textCurat = extractTextWithoutMealProposal(date?.raspuns || raspunsText);
        raspunsText = textCurat || formatMealProposalForChat(parsed, i18n.language || 'en');
      } else if (containsStructuredMealProtocol(raspunsText)) {
        adaugaMesaj(buleMesaj('ai', t('chat.errorResponseProcessing'), true));
        return;
      }

      adaugaMesaj(buleMesaj('ai', raspunsText));

      // Phase C: evaluăm afișarea reclamei doar după ce răspunsul AI s-a finalizat complet
      void maybeShowInterstitial('chat');
    } catch {
      adaugaMesaj(buleMesaj('ai', t('chat.errorConnection'), true));
    } finally {
      clearTimeout(timeoutId);
      if (activeRequestRef.current === controller) activeRequestRef.current = null;
      loadingRef.current = false;
      setLoadingChat(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const trimiteMesaj = async () => {
    if (!chatInput.trim()) return;
    // BUG-061: dacă o cerere e în zbor, NU ștergem input-ul înainte de gardă —
    // altfel textul proaspăt scris de utilizator ar fi șters și apoi aruncat
    // silențios (mesaj pierdut). Păstrăm textul în input, ca să poată fi trimis
    // după ce cererea curentă se termină.
    if (loadingRef.current) return;
    const inputCurent = chatInput;
    setChatInput('');
    await executaTrimitereMesaj(inputCurent);
  };

  const confirmMealProposal = async () => {
    // 1. Verificări stricte cu mesaje de eroare vizibile
    if (!mealProposal) {
      Alert.alert(t('alerts.titluri.eroare'), t('alerts.mesaje.dateMasaLipsesc'));
      return;
    }
    if (!session?.user?.id) {
      Alert.alert(t('alerts.titluri.eroareAutentificare'), t('alerts.mesaje.sesiuneExpirata'));
      return;
    }
    // REMED-006: gardă explicită — NU inserăm niciodată fără categoria aleasă
    // conștient de utilizator (butonul e oricum dezactivat până alege).
    if (!proposalCategory) {
      Alert.alert(t('alerts.titluri.eroare'), t('chat.sheet.selectCategoryHint'));
      return;
    }

    setSavingProposal(true);

    try {
      // 3. Inserarea batch a alimentelor o singură dată. Valorile AI sunt
      // normalizate și clampate la limitele CHECK-urilor din Postgres (BUG-007),
      // tip_masa e adus la valorile valide, iar fiecare rând primește un `id`
      // UUID determinist — reluarea aceleiași propuneri se ciocnește pe PK
      // (23505), fără rânduri duplicate. REMED-006: meal_type = categoria
      // explicită din picker, NU derivarea automată (fost „gustare" default).
      const acumMasa = new Date();
      // P1-01: identitatea acțiunii „Adaugă în jurnal" din chat. Separată de
      // identitatea operației AI (P1-12). Aceeași apăsare reluată păstrează
      // identitatea; o apăsare nouă primește alta, deci două propuneri identice
      // salvate deliberat produc două mese.
      if (!idOperatieSalvareRef.current) idOperatieSalvareRef.current = idOperatieNoua();
      const rows = construiesteRinduriMasaChat({
        idOperatie: idOperatieSalvareRef.current,
        user_id: session.user.id,
        items: mealProposal.items,
        now: acumMasa,
        meal_type: proposalCategory,
      });

      // P1-01 (Blocant A): `23505` NU mai este un verdict. `decideRezultatInsertMasa`
      // citește rândul chiar persistat și compară conținutul înainte ca ecranul să
      // aibă voie să confirme ceva. Înainte, orice duplicat era tratat ca succes și
      // modalul se construia din payload-ul LOCAL — deci utilizatorul putea citi
      // „cină / 650 kcal" în timp ce jurnalul conținea „mic dejun / 500 kcal".
      let rezultatInsert: DecizieInsertMasa;
      try {
        const rowsCuratate = rows.map((r: any) => {
          const clona = { ...r };
          if (typeof clona.id === 'string' && isNaN(Number(clona.id))) delete clona.id;
          return clona;
        });
        const { error } = await supabase.from('mese').insert(rowsCuratate);
        rezultatInsert = await decideRezultatInsertMasa(supabase as never, rows as never, { error });
      } catch (err: unknown) {
        rezultatInsert = await decideRezultatInsertMasa(
          supabase as never,
          rows as never,
          err instanceof Error ? err : new Error(String(err)),
        );
      }

      // Doar persistarea DOVEDITĂ încheie acțiunea și eliberează identitatea.
      if (rezultatInsert.tip === 'succes' || rezultatInsert.tip === 'reluare_confirmata') {
        idOperatieSalvareRef.current = null;
        // P1-04: doar persistarea DOVEDITĂ pe server invalidează datele canonice.
        // Punerea în coada offline NU emite semnal — nu este dată canonică.
        marcheazaMeseModificate(session.user.id);
      }

      // Rândul persistat sub această identitate are ALT conținut: nu confirmăm
      // nimic. Identitatea NU se eliberează ca persistare reușită — utilizatorul
      // poate renunța la propunere (ceea ce o eliberează) sau reîncerca.
      if (rezultatInsert.tip === 'conflict_continut') {
        Alert.alert(
          t('alerts.titluri.eroareLaSalvare'),
          t('alerts.mesaje.conflictOperatieMasa'),
        );
        return;
      }

      // Nu am putut citi rândul persistat: starea reală e necunoscută, deci nu
      // avem voie nici să confirmăm succes, nici să inventăm o salvare offline.
      if (rezultatInsert.tip === 'verificare_esuata') {
        Alert.alert(
          t('alerts.titluri.eroareLaSalvare'),
          t('alerts.mesaje.problemaNecunoscutaConectare'),
        );
        return;
      }

      // REV-001: Erorile structurate de server (RLS 42501, constrângeri, validare)
      // afișează alertă reală și NU intră în coada offline.
      if (rezultatInsert.tip === 'eroare_server') {
        console.error('Eroare Supabase la salvarea propunerii de masă:', rezultatInsert);
        // P1-01 (Blocant 3): respingerea structurată de server (RLS 42501,
        // constrângere, validare) înseamnă că NIMIC nu s-a persistat. Acțiunea e
        // încheiată fără rezultat, deci identitatea se abandonează — altfel o
        // propunere ulterioară, cu alt conținut, o moștenea și ajungea pe aceeași
        // cheie primară.
        idOperatieSalvareRef.current = null;
        Alert.alert(
          t('alerts.titluri.eroareLaSalvare'),
          t('alerts.mesaje.bazaDateRefuza', { eroare: rezultatInsert.mesaj })
        );
        return;
      }

      // Eșec de transport / rețea -> salvare sigură în coada offline FIFO.
      //
      // P1-02: „pus în coadă" NU înseamnă „salvat" decât dacă scrierea pe disc a
      // reușit cu adevărat. Înainte se apela `pushOfflineMeal` și se IGNORA
      // rezultatul, apoi se afișa necondiționat confirmarea — dacă AsyncStorage
      // eșua, masa exista doar în memorie și dispărea la închiderea aplicației,
      // deși utilizatorul fusese anunțat că e salvată. Camera și salvarea manuală
      // foloseau deja varianta verificată; chat-ul fusese omis.
      let toateRandurilePersistate = true;
      if (rezultatInsert.tip === 'offline') {
        for (const row of rows) {
          const payloadOffline: MasaOfflinePayload = {
            id: row.id,
            user_id: row.user_id,
            nume: row.nume,
            calorii: row.calorii,
            proteine: row.proteine,
            grasimi: row.grasimi,
            carbohidrati: row.carbohidrati,
            fibre: row.fibre,
            tip_masa: row.tip_masa,
            alimente: [],
            data: row.data,
            ora: row.ora,
            created_at: acumMasa.toISOString(),
          };
          const { persistat } = await pushOfflineMealVerificat(payloadOffline);
          if (!persistat) toateRandurilePersistate = false;
        }

        // Persistarea durabilă a eșuat: nu avem voie să confirmăm nimic.
        // Identitatea operației se PĂSTREAZĂ (P1-01), ca o reluare să rămână
        // aceeași salvare logică, nu una nouă.
        if (!toateRandurilePersistate) {
          Alert.alert(
            t('alerts.titluri.eroareLaSalvare'),
            t('alerts.mesaje.problemaNecunoscutaConectare'),
          );
          return;
        }
      }

      // 4. Finalizare cu succes sau offline-queued
      refresh();
      setMealProposalVisible(false);
      const salvatProposal = mealProposal;
      setMealProposal(null);

      // P1-03: rezumatul de confirmare folosește aceeași normalizare și aceeași
      // politică de rotunjire ca totalurile zilei. Înainte își avea propria copie
      // (`Number(...) || 0` + rotunjiri locale), deci putea afișa altceva decât
      // ceea ce ajungea efectiv în Jurnal pentru exact aceleași rânduri.
      const totalSalvat = totaluriPentruAfisare(
        calculeazaTotaluriZi(rows as unknown as Masa[]),
      );

      setSuccessModalData({
        nume: salvatProposal.nume || (rows.length === 1 ? rows[0].nume : `${rows.length} alimente`),
        calorii: totalSalvat.calorii,
        proteine: totalSalvat.proteine,
        carbohidrati: totalSalvat.carbohidrati,
        grasimi: totalSalvat.grasimi,
        tip_masa: proposalCategory,
        isOffline: rezultatInsert.tip === 'offline',
      });

      if (rezultatInsert.tip === 'offline') {
        adaugaMesaj(buleMesaj('ai', t('offline.masaSalvataOffline')));
      } else {
        adaugaMesaj(buleMesaj('ai', t('chat.mealSavedSuccess')));
      }

    } catch (e: unknown) {
      console.error('Eroare salvare propunere masă:', e);
      Alert.alert(t('alerts.titluri.eroareSistem'), t('alerts.mesaje.salvareNeprocesata'));
    } finally {
      setSavingProposal(false);
    }
  };

  const trimitePromptDirect = async (mesajText: string) => {
    await executaTrimitereMesaj(mesajText);
  };

  // REMED-026: oglindă stabilă a executaTrimitereMesaj pentru butonul „Reîncearcă"
  // din bulele de eroare. Fără ea, onRetryLast s-ar reface la fiecare render și
  // React.memo al listei nu ar mai putea sări peste re-randările inutile la tastare.
  const executareRef = useRef(executaTrimitereMesaj);
  executareRef.current = executaTrimitereMesaj;

  // Retrimite ULTIMUL mesaj de utilizator (nu textul erorii). Deps [] + refs:
  // funcție perfect stabilă pentru memoaizarea listei (REMED-017).
  const retryLastUserMessage = useCallback(() => {
    const mesajeCurente = mesajeRef.current;
    for (let i = mesajeCurente.length - 1; i >= 0; i--) {
      const m = mesajeCurente[i];
      if (m.role === 'user' && !m.isError && m.text.trim()) {
        // BUG-061: esteRetry=true — textul utilizatorului e deja afișat; nu-l
        // duplicăm ca bulă nouă, doar re-trimitem aceeași întrebare.
        void executareRef.current(m.text, true);
        return;
      }
    }
  }, []);

  const handleResetChat = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setNewChatModalVisible(true);
  };

  const confirmResetChat = async () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    const initialMsg: ChatMessage[] = [
      buleMesaj('ai', t('chat.welcome'))
    ];
    setMesaje(initialMsg);
    await AsyncStorage.removeItem(getChatStorageKey());
    setNewChatModalVisible(false);
    setShowNewChatBanner(true);
    setTimeout(() => setShowNewChatBanner(false), 3200);
  };

  // P1-16 / DEFECT F: offsetul compozitorului pe ambele platforme (iOS + Android).
  // Pe Android cu edgeToEdgeEnabled: true, softwareKeyboardLayoutMode: resize NU
  // redimensionează fereastra (sistemul desenează sub bară și sub tastatură).
  // Astfel, compozitorul trebuie ridicat cu înălțimea tastaturii pe ambele platforme.
  // Folosim useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true }) ca sursă animată 60fps,
  // completat cu un fallback Keyboard listener pentru compatibilitate maximă.
  const [kbHeightFallback, setKbHeightFallback] = useState(0);
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKbHeightFallback(e.endCoordinates.height);
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKbHeightFallback(0);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true });
  const composerBottomStyle = useAnimatedStyle(() => {
    const kbH = Math.max(keyboard.height.value, kbHeightFallback);
    const visible = kbH > 0;
    const kbOffset = visible ? kbH : 0;
    const base = visible ? 10 : tabBarHeight + 8;
    return { paddingBottom: base + kbOffset };
  }, [tabBarHeight, kbHeightFallback]);

  return (
    <View style={[styles.outerContainer, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accentSecondary }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentTertiary }]} />

      <KeyboardAwareScreen style={styles.container} keyboardDisabled>

        {/* Header */}
        <Animated.View testID="coach-compact-header" entering={reduceMotion ? undefined : FadeInDown.duration(500)} style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <View style={styles.headerMainRow}>
            <View style={styles.headerIdentity}>
              <View style={[styles.aiAvatar, { borderColor: colors.accentSecondary + '44' }]}>
                <Image
                  testID="coach-avatar"
                  source={require('../../assets/coach/getflow-coach-avatar.png')}
                  style={styles.aiAvatarImage}
                  resizeMode="cover"
                  accessible={false}
                />
              </View>
              <View style={styles.aiMeta}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>{t('chat.coachLabel')}</Text>
                <View style={styles.coachMetaRow}>
                  <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.aiSubtitle, { color: colors.textSecondary }]}>{t('chat.coachSubtitle')}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleResetChat}
              style={[styles.newChatPill, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
              activeOpacity={0.85}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('chat.newChatA11y')}
            >
              <Text style={[styles.newChatPillText, { color: colors.textPrimary }]}>{t('chat.newChat')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.headerStatsRow}>
            <View style={[styles.contextChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.cardBorder }]}>
              <View style={[styles.miniIndicator, { backgroundColor: colors.accent }]} />
              <Text style={[styles.contextChipText, { color: colors.textPrimary }]}>{totalCalorii} / {caloriiTinta} kcal</Text>
            </View>
            <View style={[styles.contextChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.cardBorder }]}>
              <View style={[styles.miniIndicator, { backgroundColor: colors.accentSecondary }]} />
              <Text style={[styles.contextChipText, { color: colors.textPrimary }]}>{totalProteine} / {proteineTinta} g proteine</Text>
            </View>
          </View>
        </Animated.View>

        {showNewChatBanner && (
          <Animated.View entering={FadeInUp.duration(400)} exiting={FadeOut.duration(300)} style={[styles.newChatBanner, { backgroundColor: colors.accentSecondary + '22', borderColor: colors.accentSecondary }]}>
            <Sparkles size={16} color={colors.accentSecondary} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.newChatBannerText, { color: colors.textPrimary }]}>
              {t('chat.newChatBanner')}
            </Text>
          </Animated.View>
        )}

        {/* Chat History Surface — receives most of the viewport */}
        <ScrollView
          testID="coach-history-surface"
          ref={scrollViewRef}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          style={styles.chatScroll}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'flex-end',
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 10,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Small elegant introductory surface when conversation is fresh */}
          {mesaje.length <= 1 ? (
            <View style={[styles.introSurface, { backgroundColor: colors.surfaceElevated, borderColor: colors.cardBorder }]}>
              <View style={[styles.introIconBox, { backgroundColor: colors.accentSecondary + '20' }]}>
                <Sparkles size={14} color={colors.accentSecondary} />
              </View>
              <View style={styles.introContent}>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.introTitle, { color: colors.textPrimary }]}>
                  {t('chat.emptyTitle')}
                </Text>
                <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={[styles.introSubtitle, { color: colors.textSecondary }]}>
                  {t('chat.emptySubtitle')}
                </Text>
              </View>
            </View>
          ) : (
            <ChatMessageList
              messages={mesaje}
              colors={colors}
              loadingChat={loadingChat}
              onRetryLast={retryLastUserMessage}
            />
          )}
        </ScrollView>

        {/* Quick AI Action Chips — horizontally scrollable single compact row */}
        {kbHeightFallback === 0 ? (
          <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(400)} style={styles.quickActionsRow}>
            <ScrollView
              testID="coach-quick-actions"
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickActionsList}
              keyboardShouldPersistTaps="handled"
            >
              <TouchableOpacity
                style={[styles.quickActionChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.cardBorder }]}
                onPress={() => trimitePromptDirect(t('chat.quickAnalyzeA11y'))}
                accessibilityRole="button"
                accessibilityLabel={t('chat.quickAnalyzeA11y')}
              >
                <BarChart3 size={13} color={colors.accentSecondary} />
                <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.quickActionText, { color: colors.textPrimary }]}>
                  {t('chat.quickAnalyzeTitle')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickActionChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.cardBorder }]}
                onPress={() => trimitePromptDirect(t('chat.quickProteinA11y'))}
                accessibilityRole="button"
                accessibilityLabel={t('chat.quickProteinA11y')}
              >
                <Dumbbell size={13} color={colors.accent} />
                <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.quickActionText, { color: colors.textPrimary }]}>
                  {t('chat.quickProteinTitle')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickActionChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.accentSecondary + '66' }]}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setRecipeModalVisible(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('chat.quickRecipeA11y')}
              >
                <ChefHat size={13} color={colors.accentSecondary} />
                <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.quickActionText, { color: colors.textPrimary }]}>
                  {t('chat.quickRecipeTitle')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickActionChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.cardBorder }]}
                onPress={() => trimitePromptDirect(t('chat.planNextMealA11y'))}
                accessibilityRole="button"
                accessibilityLabel={t('chat.planNextMealA11y')}
              >
                <Utensils size={13} color={colors.textSecondary} />
                <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.quickActionText, { color: colors.textPrimary }]}>
                  {t('chat.planNextMealTitle')}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        ) : null}

        {mealProposal && !mealProposalVisible && (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInUp.duration(400)}
            style={[styles.proposalBannerCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.accentSecondary }]}
          >
            <View style={styles.proposalBannerHeader}>
              <View style={[styles.proposalBannerIcon, { backgroundColor: colors.accentSecondary + '20' }]}>
                <Utensils size={18} color={colors.accentSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.proposalBannerTag, { color: colors.textPrimary }]}>
                  {mealProposal.nume || t('chat.recipeCard.untitled')}
                </Text>
                <Text style={[styles.proposalBannerSub, { color: colors.textSecondary }]}>
                  {`${mealProposal.totals?.kcal || 0} kcal · P ${Math.round(mealProposal.totals?.protein_g || 0)}g · C ${Math.round(mealProposal.totals?.carbs_g || 0)}g · G ${Math.round(mealProposal.totals?.fat_g || 0)}g`}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.proposalBannerBtn, { backgroundColor: colors.accentSecondary }]}
                onPress={() => setMealProposalVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('chat.addToJournal')}
              >
                <Text style={[styles.proposalBannerBtnText, { color: colors.textOnAccentSecondary }]}>
                  {t('chat.addToJournal')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { idOperatieSalvareRef.current = null; setMealProposal(null); }}
                style={styles.proposalBannerClose}
                accessibilityRole="button"
                accessibilityLabel={t('alerts.butoane.anuleaza')}
              >
                <X size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Input */}
        <Animated.View
          testID="coach-composer"
          entering={reduceMotion ? undefined : FadeInDown.duration(600).delay(200)}
          style={[styles.inputWrapper, composerBottomStyle]}
        >
          <View style={[styles.inputContainer, { borderColor: colors.accentSecondary + '33', backgroundColor: colors.surfaceElevated }]}>
            <LinearGradient colors={[colors.accentSecondary + '14', 'rgba(0,0,0,0)']} style={styles.inputGrad}>
              <TextInput
                testID="chat-input"
                accessibilityLabel={t('chat.inputA11y')}
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder={t('chat.inputPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={chatInput}
                onChangeText={setChatInput}
                multiline
                maxLength={1000}
                returnKeyType="send"
                onSubmitEditing={() => { if (!loadingChat && chatInput.trim()) trimiteMesaj(); }}
                blurOnSubmit={false}
              />
              <TouchableOpacity
                testID="send-button"
                accessibilityRole="button"
                accessibilityLabel={t('chat.sendA11y')}
                hitSlop={4}
                style={[styles.sendBtn, !chatInput.trim() && { opacity: 0.4 }]}
                onPress={trimiteMesaj}
                disabled={loadingChat || !chatInput.trim()}
              >
                <LinearGradient colors={colors.accentGradient} style={styles.sendGrad}>
                  <Send size={18} color={colors.background} strokeWidth={2.5} />
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </Animated.View>

      </KeyboardAwareScreen>

      {/* Modal design UI animat pentru Începere Conversație Nouă */}
      <Modal
        visible={newChatModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNewChatModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[StyleSheet.absoluteFill, styles.modalBackdropFill]} />
          <View style={[styles.modalCard, { backgroundColor: colors.surfaceBg, borderColor: colors.accentSecondary }]}>
            <View style={[styles.modalIconRing, { backgroundColor: colors.accentSecondary + '20', borderColor: colors.accentSecondary }]}>
              <RotateCcw size={36} color={colors.accentSecondary} />
            </View>
            <Text maxFontSizeMultiplier={1.3} style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('chat.newChatConfirmTitle')}</Text>
            <Text maxFontSizeMultiplier={1.3} style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              {t('chat.newChatConfirmBody')}
            </Text>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
                onPress={() => setNewChatModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={t('chat.modalCancelA11y')}
              >
                <Text style={[styles.modalCancelText, { color: colors.textPrimary }]}>{t('alerts.butoane.anuleaza')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: colors.accentSecondary }]}
                onPress={confirmResetChat}
                accessibilityRole="button"
                accessibilityLabel={t('chat.modalConfirmA11y')}
              >
                {/* REMED-013: text negru pe accentSecondary (contrast >= 4.5:1). */}
                <Sparkles size={16} color={colors.textOnAccentSecondary} />
                <Text style={[styles.modalConfirmText, { color: colors.textOnAccentSecondary }]}>{t('chat.newChatConfirmAction')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmSheet
        visible={mealProposalVisible}
        title={t('chat.confirmSheet.title')}
        message={t('chat.confirmSheet.subtitle')}
        confirmLabel={savingProposal ? t('chat.saving') : t('chat.addToJournal')}
        destructive={false}
        confirmDisabled={!proposalCategory || savingProposal}
        onConfirm={confirmMealProposal}
        onCancel={() => {
          setMealProposalVisible(false);
          // P1-01 (Blocant 3): închiderea propunerii abandonează acțiunea de salvare.
          idOperatieSalvareRef.current = null;
          setMealProposal(null);
          setProposalCategory(null);
        }}
        // REMED-006/007: cardul complet al rețetei + picker-ul EXPLICIT de
        // categorie, compus aici și randat de ConfirmSheet în `extra`.
        // Niciun auto-insert: „Adaugă în Jurnal" e o acțiune conștientă, după
        // recapitularea rețetei și alegerea categoriei (butonul e dezactivat).
        extra={
          mealProposal ? (
            <View style={[styles.proposalCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              {mealProposal.imageUrl ? (
                <Image
                  source={{ uri: mealProposal.imageUrl }}
                  style={styles.proposalImage}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : null}
              <Text maxFontSizeMultiplier={1.3} style={[styles.proposalCardTitle, { color: colors.textPrimary }]}>
                {mealProposal.nume || t('chat.recipeCard.untitled')}
              </Text>

              <Text maxFontSizeMultiplier={1.3} style={[styles.proposalSectionTitle, { color: colors.textSecondary }]}>
                {t('chat.recipeCard.ingredients')}
              </Text>
              {mealProposal.items.map((it, idx) => (
                <View key={`${it.name}-${idx}`} style={styles.proposalItemRow}>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.proposalItemName, { color: colors.textPrimary }]}>
                    {it.name}
                  </Text>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.proposalItemKcal, { color: colors.textSecondary }]}>
                    {`${it.qty}${it.unit} · ${it.kcal} kcal`}
                  </Text>
                </View>
              ))}

              <View style={styles.macroRowSheet}>
                <Text maxFontSizeMultiplier={1.3} style={[styles.macroVal, { color: colors.textPrimary, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  {`${mealProposal.totals?.kcal || 0} kcal`}
                </Text>
                <Text maxFontSizeMultiplier={1.3} style={[styles.macroVal, { color: colors.textPrimary, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  {`P ${Math.round(mealProposal.totals?.protein_g || 0)}g`}
                </Text>
                <Text maxFontSizeMultiplier={1.3} style={[styles.macroVal, { color: colors.textPrimary, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  {`C ${Math.round(mealProposal.totals?.carbs_g || 0)}g`}
                </Text>
                <Text maxFontSizeMultiplier={1.3} style={[styles.macroVal, { color: colors.textPrimary, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  {`F ${Math.round(mealProposal.totals?.fat_g || 0)}g`}
                </Text>
              </View>

              {mealProposal.preparare ? (
                <>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.proposalSectionTitle, { color: colors.textSecondary }]}>
                    {t('chat.recipeCard.preparare')}
                  </Text>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.proposalPreparare, { color: colors.textSecondary }]}>
                    {mealProposal.preparare}
                  </Text>
                </>
              ) : null}

              <Text maxFontSizeMultiplier={1.3} style={[styles.categoryHint, { color: colors.textSecondary }]}>
                {t('chat.sheet.selectCategoryHint')}
              </Text>
              <View style={styles.categoryRow}>
                {MEAL_CATEGORIES.map((cat) => {
                  const selected = proposalCategory === cat.id;
                  const iconName = CATEGORIE_ICONA[cat.id];
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={t(`chat.mealCategory.${cat.id}`)}
                      onPress={() => setProposalCategory(cat.id)}
                      style={[
                        styles.categoryChip,
                        {
                          backgroundColor: selected ? colors.accentSecondary : colors.surfaceElevated,
                          borderColor: selected ? colors.accentSecondary : colors.border,
                        },
                      ]}
                    >
                      {/* REMED-013: text negru pe accentSecondary (contrast >= 4.5:1). */}
                      <FlowIcon name={iconName} size={14} color={selected ? colors.textOnAccentSecondary : colors.textPrimary} />
                      <Text
                        maxFontSizeMultiplier={1.3}
                        style={[styles.categoryChipText, { color: selected ? colors.textOnAccentSecondary : colors.textPrimary }]}
                      >
                        {t(`chat.mealCategory.${cat.id}`)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null
        }
      />

      <RecipeGeneratorModal
        visible={recipeModalVisible}
        onClose={() => setRecipeModalVisible(false)}
        onGenerate={(prompt) => trimitePromptDirect(prompt)}
        caloriiRamase={caloriiTinta - totalCalorii}
        proteineRamase={proteineTinta - totalProteine}
      />

      <MealSaveSuccessModal
        visible={!!successModalData}
        data={successModalData}
        onDismiss={handleSuccessDismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  proposalBannerCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  proposalBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  proposalBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  proposalBannerTag: {
    fontSize: 14,
    fontWeight: '700',
  },
  proposalBannerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  proposalBannerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  proposalBannerBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  proposalBannerClose: {
    padding: 4,
  },
  outerContainer: { flex: 1 },
  container: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
  glowTop: { position: 'absolute', top: -100, right: -80, width: 300, height: 300, borderRadius: 150, opacity: 0.06 },
  glowBottom: { position: 'absolute', bottom: 100, left: -80, width: 280, height: 280, borderRadius: 140, opacity: 0.04 },

  // UX-014: paddingTop e setat inline in JSX (paddingTop: insets.top + 10); o
  // valoare fixa aici era mereu suprascrisa — cod mort scos.
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  headerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  aiAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    marginRight: 8,
  },
  aiAvatarImage: { width: '100%', height: '100%' },
  aiMeta: {
    flex: 1,
    minWidth: 0,
  },
  coachMetaRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0, gap: 6 },
  aiSubtitle: {
    flexShrink: 1,
    fontSize: 11,
  },
  newChatPill: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChatPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  headerStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  title: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  contextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 999,
    borderWidth: 1,
  },
  contextChipText: { fontSize: 11, fontWeight: '700' },
  miniIndicator: { width: 5, height: 5, borderRadius: 2.5 },

  chatScroll: { flex: 1 },
  aiBubbleLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
    marginLeft: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  bubble: {
    marginBottom: 12,
    width: '100%',
  },
  bubbleUser: {
    alignItems: 'flex-end',
  },
  bubbleAI: {
    alignItems: 'flex-start',
  },
  bubbleContentUser: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    maxWidth: '85%',
  },
  bubbleContentAI: {
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    maxWidth: '88%',
    overflow: 'hidden',
    borderWidth: 1,
  },
  bubbleContentAIGrad: { paddingVertical: 12, paddingHorizontal: 14 },
  textUser: { fontSize: 14, lineHeight: 21, fontWeight: '600' },
  textAI: { fontSize: 14, lineHeight: 21 },
  typingRow: { flexDirection: 'row', gap: 6, paddingVertical: 4, paddingHorizontal: 4 },

  inputWrapper: { paddingHorizontal: 16, paddingTop: 4 },
  inputContainer: { borderRadius: 22, overflow: 'hidden', borderWidth: 1 },
  inputGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 5 },
  input: { flex: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, maxHeight: 100, minHeight: 40, fontSize: 14, lineHeight: 19 },
  sendBtn: { width: 42, height: 42, borderRadius: 13, overflow: 'hidden', marginLeft: 6 },
  sendGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  quickActionsRow: { paddingBottom: 4 },
  quickActionsList: { gap: 8, paddingHorizontal: 16, paddingRight: 20, alignItems: 'center' },
  quickActionChip: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickActionCard: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickActionText: { fontSize: 12, fontWeight: '700' },
  quickActionTitle: { fontSize: 12, fontWeight: '700' },

  introSurface: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    gap: 10,
  },
  introIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introContent: { flex: 1, minWidth: 0 },
  introTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  introSubtitle: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },
  newChatBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  newChatBannerText: {
    fontSize: 13,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBackdropFill: {
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalCard: {
    width: '100%',
    borderRadius: 28,
    borderWidth: 1.5,
    padding: 24,
    alignItems: 'center',
  },
  modalIconRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '800',
  },
  modalConfirmBtn: {
    flex: 1.2,
    height: 48,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
  },
  // REMED-027: oră discretă sub textul bulei, fără să concureze cu conținutul.
  bubbleTime: {
    fontSize: 11,
    marginTop: 6,
    alignSelf: 'flex-end',
    opacity: 0.85,
  },
  // REMED-026: buton de reîncercare în interiorul bulei de eroare AI.
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  // REMED-006/007: cardul propunerii de masă + picker-ul explicit de categorie.
  proposalCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  proposalImage: {
    width: '100%',
    height: 150,
    borderRadius: 14,
    marginBottom: 12,
  },
  proposalCardTitle: {
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 12,
  },
  proposalSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  proposalItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  proposalItemName: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  proposalItemKcal: {
    fontSize: 12,
  },
  macroRowSheet: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  macroVal: {
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  proposalPreparare: {
    fontSize: 13,
    lineHeight: 19,
  },
  categoryHint: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
