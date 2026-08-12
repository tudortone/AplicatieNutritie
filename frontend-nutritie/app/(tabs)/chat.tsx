
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Image,
  ScrollView, Keyboard, Alert, Modal, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildApiUrl } from '@/lib/api';
import { useLocalSearchParams } from 'expo-router';
import { useFocusRefresh } from '../../hooks/useFocusRefresh';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, FadeOut,
  useAnimatedKeyboard, useAnimatedStyle,
} from 'react-native-reanimated';
import { Send, Sparkles, RotateCcw, BarChart3, Dumbbell, ChefHat, Zap, RefreshCw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useMeseAzi } from '../../hooks/useMeseAzi';
import { useCurrentDayKey } from '../../hooks/useCurrentDayKey';
import { useTranslation } from 'react-i18next';
// REMED-002: instanța i18next pentru traduceri în funcții de nivel modul
// (cerePropunereMasa), unde rulează fără hook.
import i18n from '../../i18n';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import BouncingDot from '../../components/BouncingDot';
import { RecipeGeneratorModal } from '../../components/RecipeGeneratorModal';
import { supabase } from '../../supabase';
import { ConfirmSheet } from '../../components/ui/ConfirmSheet';
import { construiesteRinduriMasaChat, esteEroareDuplicate } from '../../lib/payloadMese';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import KeyboardAwareScreen, { useContentBottomPadding } from '@/components/ui/KeyboardAwareScreen';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { parseMealProposal, type MealProposal } from '../../lib/parseMealProposal';
// REMED-006: categoriile de masă aparțin lib/mealUtils (read-only) — aici doar le citim;
// eticheta tradusă o derivăm noi din id (clés chat.mealCategory.*), nu din label-ul RO fix.
import { MEAL_CATEGORIES, CATEGORIE_ICONA } from '../../lib/mealUtils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { TipMasa } from '../../types';
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
    body: JSON.stringify({ mesaj }),
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
  // Aliniat cu regex-ul din backend (/api/chat): "am mâncat"/"am consumat" se caută
  // oriunde în frază (ex. "azi am mâncat 2 ouă"), nu doar la început. Altfel fallback-ul
  // /api/log-food-from-chat nu se declanșa și utilizatorul vedea doar eroarea AI.
  return /(?:am m[aâ]ncat|am consumat|am servit|am b[aă]ut|logheaz[aă]|[iî]nregistreaz[aă]|pune [iî]n jurnal|adaug[aă] [iî]n jurnal|adaug[aă] masa|salveaz[aă] masa)\b/i.test(lower);
};

export default function ChatScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { session } = useAuth();
  const currentDayKey = useCurrentDayKey();
  const insets = useSafeAreaInsets();
  const { tabBarHeight } = useResponsiveLayout();
  const reduceMotion = useReducedMotion();
  const contentBottomPadding = useContentBottomPadding();
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
  }, [session?.user?.id, currentDayKey]);

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

  // REMED-003: offsetul tastaturii e condus UNIC de useAnimatedKeyboard pe
// compozitor (mai jos). Aici rămâne doar auto-scroll-ul la deschidere — nu mai
// există toggle manual de padding (acela + KAV = offset dublu la deschidere).
useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => {
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
      }
    );
    return () => {
      keyboardDidShowListener.remove();
    };
  }, []);

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
          proteineTinta
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
      // CHAT-009: `parsed` nu mai e reasignat după eliminarea fallback-ului mort.
      const parsed = parseMealProposal(date) || parseMealProposal(raspunsText);

      // CHAT-009: fallback-ul catre /api/log-food-from-chat de aici era cod mort —
      // daca isMealLogIntent(mesajText) e adevarat, ramura de meal-intent de mai
      // sus iese mereu cu return (try SAU catch), deci nu se ajunge aici; daca e
      // fals, conditia de aici nu putea fi adevarata. Blocul a fost eliminat.

      if (parsed && (parsed.type === 'MEAL_PROPOSAL' || Array.isArray(parsed.items))) {
        if (Array.isArray(parsed.items)) parsed.type = 'MEAL_PROPOSAL';
        setMealProposal(parsed);
        setProposalCategory(null); // REMED-006: categorie curată la fiecare propunere nouă.
        setMealProposalVisible(true);
        raspunsText = t('chat.foodsIdentified');
      }

      adaugaMesaj(buleMesaj('ai', raspunsText));
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
      const rows = construiesteRinduriMasaChat({
        user_id: session.user.id,
        items: mealProposal.items,
        now: acumMasa,
        meal_type: proposalCategory,
      });

      const { error } = await supabase.from('mese').insert(rows);

      if (error) {
        // Idempotență: propunerea a fost deja adăugată (același id) — nu se
        // creează duplicat; o tratăm ca succes.
        if (!esteEroareDuplicate(error)) {
          console.error("Eroare Supabase:", error);
          Alert.alert(t('alerts.titluri.eroareLaSalvare'), t('alerts.mesaje.bazaDateRefuza', { eroare: error.message }));
          throw error;
        }
      }

      // 4. Finalizare cu succes
      refresh();
      setMealProposalVisible(false);
      setMealProposal(null);
      setProposalCategory(null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      adaugaMesaj(buleMesaj('ai', t('chat.mealSavedSuccess')));

    } catch (e: unknown) {
      console.error('Eroare salvare propunere masă:', e);
      // Dacă eroarea nu e de la Supabase, o prindem aici
      const mesajEroare = e instanceof Error ? e.message : '';
      if (!mesajEroare.includes('Baza de date')) {
          Alert.alert(t('alerts.titluri.eroareSistem'), t('alerts.mesaje.salvareNeprocesata'));
      }
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

  // REMED-003: offsetul compozitorului vine dintr-o SINGURĂ sursă animată
  // (useAnimatedKeyboard). iOS = tastatură plutitoare (fără resize) → +întreaga
  // înălțime a tastaturii. Android = softwareKeyboardLayoutMode:resize ridică
  // singur fereastra → NU adăugăm înălțimea tastaturii (ar fi offset dublu),
  // doar spațiu de respirație. KAV e dezactivat pe acest ecran (keyboardDisabled).
  const keyboard = useAnimatedKeyboard();
  const composerBottomStyle = useAnimatedStyle(() => {
    const kbH = keyboard.height.value;
    const visible = kbH > 0;
    const iosOffset = Platform.OS === 'ios' && visible ? kbH : 0;
    const base = visible ? 10 : tabBarHeight + 8;
    return { paddingBottom: base + iosOffset };
  }, [tabBarHeight]);

  return (
    <View style={[styles.outerContainer, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accentSecondary }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentTertiary }]} />

      <KeyboardAwareScreen style={styles.container} keyboardDisabled>

        {/* Header */}
        <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(500)} style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <View style={styles.headerMainRow}>
            <View style={styles.headerIdentity}>
              <View style={[styles.aiAvatar, { borderColor: colors.accentSecondary + '44' }]}>
                <LinearGradient colors={colors.accentSecondaryGradient} style={styles.aiAvatarGradient}>
                  {/* REMED-013: avatarul e decorativ (inițiale); textul trece pe un
                      chip întunecat ca contrastul să nu depindă de gradient. */}
                  <View style={styles.aiAvatarChip}>
                    <Text style={styles.aiAvatarText}>NC</Text>
                  </View>
                </LinearGradient>
              </View>
              <View style={styles.aiMeta}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>NutriAI Coach</Text>
                <Text maxFontSizeMultiplier={1.3} style={[styles.aiSubtitle, { color: colors.textSecondary }]}>{t('chat.coachSubtitle')}</Text>
                <View style={styles.onlineRow}>
                  <View style={[styles.onlineDot, { backgroundColor: colors.accent }]} />
                  <Text maxFontSizeMultiplier={1.3} style={[styles.onlineText, { color: colors.accent }]}>{t('chat.onlineNow')}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleResetChat}
              style={[styles.newChatPill, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
              activeOpacity={0.85}
              hitSlop={{ top: 2, bottom: 2 }}
              accessibilityRole="button"
              accessibilityLabel={t('chat.newChatA11y')}
            >
              <Text style={[styles.newChatPillText, { color: colors.textPrimary }]}>{t('chat.newChat')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.headerStatsRow}>
            <View style={[styles.contextChip, { backgroundColor: colors.accent + '14', borderColor: colors.accent + '26' }]}>
              <Text style={[styles.contextChipText, { color: colors.accent }]}>{totalCalorii} / {caloriiTinta} kcal</Text>
            </View>
            <View style={[styles.contextChip, { backgroundColor: colors.accentSecondary + '14', borderColor: colors.accentSecondary + '26' }]}>
              <Text style={[styles.contextChipText, { color: colors.accentSecondary }]}>{totalProteine} / {proteineTinta} g proteine</Text>
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

        {/* Messages / Empty State */}
        {mesaje.length <= 1 ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.emptyChatContainer, { paddingBottom: contentBottomPadding }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.emptyHeroCard, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceElevated }]}>
              <LinearGradient colors={[colors.accentSecondary + '18', 'rgba(0,0,0,0.18)']} style={styles.emptyHeroGradient}>
                <View style={[styles.emptyAvatar, { backgroundColor: colors.accentSecondary + '22' }]}>
                  <Text style={styles.emptyAvatarText}>NC</Text>
                </View>
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('chat.emptyTitle')}</Text>
                <Text maxFontSizeMultiplier={1.3} style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  {t('chat.emptySubtitle')}
                </Text>
              </LinearGradient>
            </View>

            <View style={styles.quickActionsList}>
              <TouchableOpacity
                style={[styles.quickActionCard, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                onPress={() => trimitePromptDirect('Analizează mesele mele de azi și spune-mi ce să mai mănânc până diseară.')}
                accessibilityRole="button"
                accessibilityLabel={t('chat.quickAnalyzeA11y')}
              >
                <BarChart3 size={24} color={colors.textPrimary} />
                <View style={styles.quickActionBody}>
                  <Text style={[styles.quickActionTitle, { color: colors.textPrimary }]}>{t('chat.quickAnalyzeTitle')}</Text>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.quickActionText, { color: colors.textSecondary }]}>{t('chat.quickAnalyzeText')}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickActionCard, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                onPress={() => trimitePromptDirect('Sugerează-mi o masă bogată în proteine, sub 600 kcal.')}
                accessibilityRole="button"
                accessibilityLabel={t('chat.quickProteinA11y')}
              >
                <Dumbbell size={24} color={colors.textPrimary} />
                <View style={styles.quickActionBody}>
                  <Text style={[styles.quickActionTitle, { color: colors.textPrimary }]}>{t('chat.quickProteinTitle')}</Text>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.quickActionText, { color: colors.textSecondary }]}>{t('chat.quickProteinText')}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickActionCard, { backgroundColor: colors.accent, borderColor: colors.accent }]}
                onPress={() => setRecipeModalVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('chat.quickRecipeA11y')}
              >
                <ChefHat size={24} color={colors.background} />
                <View style={styles.quickActionBody}>
                  <Text style={[styles.quickActionTitle, { color: colors.background }]}>{t('chat.quickRecipeTitle')}</Text>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.quickActionText, { color: colors.background }]}>{t('chat.quickRecipeText')}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          <>
            <ScrollView
              ref={scrollViewRef}
              onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
              style={styles.chatScroll}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 18,
                paddingBottom: contentBottomPadding,
              }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* REMED-017: listă memoaizată — la tastare (chatInput) doar ChatScreen
                  se re-randează; bulele rămân nere-randate. */}
              <ChatMessageList
                messages={mesaje}
                colors={colors}
                loadingChat={loadingChat}
                onRetryLast={retryLastUserMessage}
              />
            </ScrollView>

            {/* Quick AI Action Chips in Active Chat */}
            <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(500).delay(150)} style={styles.chipsRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                <TouchableOpacity
                  style={[styles.actionChip, { backgroundColor: colors.accent, borderColor: colors.accent }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setRecipeModalVisible(true); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.recipeGenChipA11y')}
                >
                  <ChefHat size={14} color={colors.background} />
                  <Text style={[styles.actionChipText, { color: colors.background, fontWeight: '800' }]}>{t('chat.recipeGenTitle')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionChip, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => trimitePromptDirect("Ce pot găti rapid și sănătos în mai puțin de 15 minute?")}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.quickDinnerA11y')}
                >
                  <Zap size={14} color={colors.textPrimary} />
                  <Text style={[styles.actionChipText, { color: colors.textPrimary }]}>{t('chat.quickDinnerLabel')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionChip, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => trimitePromptDirect(`Care este cea mai eficientă rețetă bogată în proteine pentru a-mi atinge ținta de ${proteineTinta}g?`)}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.proteinBombA11y')}
                >
                  <Dumbbell size={14} color={colors.textPrimary} />
                  <Text style={[styles.actionChipText, { color: colors.textPrimary }]}>{t('chat.proteinBombLabel')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionChip, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => trimitePromptDirect("Analizează mesele mele de azi și dă-mi o evaluare generală și un sfat pentru seară.")}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.quickDayA11y')}
                >
                  <BarChart3 size={14} color={colors.textPrimary} />
                  <Text style={[styles.actionChipText, { color: colors.textPrimary }]}>{t('chat.quickDayLabel')}</Text>
                </TouchableOpacity>
              </ScrollView>
            </Animated.View>
          </>
        )}

        {/* Input */}
        <Animated.View
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
                  const Icona = CATEGORIE_ICONA[cat.id];
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
                      <Icona size={14} color={selected ? colors.textOnAccentSecondary : colors.textPrimary} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1 },
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -100, right: -80, width: 300, height: 300, borderRadius: 150, opacity: 0.06 },
  glowBottom: { position: 'absolute', bottom: 100, left: -80, width: 280, height: 280, borderRadius: 140, opacity: 0.04 },

  // UX-014: paddingTop e setat inline in JSX (paddingTop: insets.top + 10); o
  // valoare fixa aici era mereu suprascrisa — cod mort scos.
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  headerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  aiAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    marginRight: 12,
  },
  aiAvatarGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  aiMeta: {
    flex: 1,
  },
  aiSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  newChatPill: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChatPillText: {
    fontSize: 13,
    fontWeight: '800',
  },
  headerStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  title: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  onlineText: { fontSize: 12, fontWeight: '600' },
  contextChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  contextChipText: { fontSize: 12, fontWeight: '700' },

  chatScroll: { flex: 1 },
  aiBubbleLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    marginLeft: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  bubble: {
    marginBottom: 16,
    width: '100%',
  },
  bubbleUser: {
    alignItems: 'flex-end',
  },
  bubbleAI: {
    alignItems: 'flex-start',
  },
  bubbleContentUser: {
    padding: 16,
    borderRadius: 22,
    borderBottomRightRadius: 6,
    maxWidth: '88%',
  },
  bubbleContentAI: {
    borderRadius: 22,
    borderBottomLeftRadius: 8,
    maxWidth: '88%',
    overflow: 'hidden',
    borderWidth: 1,
  },
  bubbleContentAIGrad: { padding: 16 },
  textUser: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  textAI: { fontSize: 15, lineHeight: 22 },
  typingRow: { flexDirection: 'row', gap: 6, paddingVertical: 4, paddingHorizontal: 4 },

  inputWrapper: { paddingHorizontal: 16, paddingTop: 4 },
  inputContainer: { borderRadius: 24, overflow: 'hidden', borderWidth: 1 },
  inputGrad: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingVertical: 8 },
  input: { flex: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, maxHeight: 110, minHeight: 42, fontSize: 15, lineHeight: 20 },
  sendBtn: { width: 42, height: 42, borderRadius: 14, overflow: 'hidden', marginLeft: 8 },
  sendGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  chipsRow: { paddingBottom: 6 },
  chipsScroll: { gap: 8, paddingHorizontal: 16 },
  actionChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1 },
  actionChipText: { fontSize: 12, fontWeight: '700' },

  emptyChatContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  emptyHeroCard: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 14,
  },
  emptyHeroGradient: {
    padding: 22,
    alignItems: 'flex-start',
  },
  emptyAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyAvatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  quickActionsList: {
    gap: 12,
  },
  quickActionCard: {
    minHeight: 76,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quickActionBody: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  quickActionText: {
    fontSize: 13,
    lineHeight: 18,
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
  // REMED-013: chip întunecat în spatele inițialelor avatarului (decorativ).
  aiAvatarChip: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
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
