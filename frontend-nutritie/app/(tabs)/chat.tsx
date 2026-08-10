
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Keyboard, Alert, Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildApiUrl } from '@/lib/api';
import { useLocalSearchParams } from 'expo-router';
import { useFocusRefresh } from '../../hooks/useFocusRefresh';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOut } from 'react-native-reanimated';
import { Send, Sparkles, RotateCcw, BarChart3, Dumbbell, ChefHat, Zap } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useMeseAzi } from '../../hooks/useMeseAzi';
import { useCurrentDayKey } from '../../hooks/useCurrentDayKey';
import { useTranslation } from 'react-i18next';
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
      statusText || `Serverul nu a putut genera propunerea de masă (status ${response.status}).`,
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
    throw new Error('Serverul nu a returnat o propunere de masă validă.');
  }
  return propunere;
}

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
    { id: newMsgId(), role: 'ai', text: 'Bună! Sunt asistentul tău nutrițional AI. Îți pot sugera mese, analiza dieta de azi sau răspunde la orice întrebare despre nutriție.' }
  ]);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
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
          setMesaje(parsed);
          mesajeKeyRef.current = storageKey;
        } else if (mesajeKeyRef.current !== storageKey) {
          // zi/sesiune noua fara istoric salvat -> pornim curat.
          setMesaje([
            { id: newMsgId(), role: 'ai', text: 'Bună! Sunt asistentul tău nutrițional AI. Îți pot sugera mese, analiza dieta de azi sau răspunde la orice întrebare despre nutriție.' }
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
      // BUG-039: istoricul zilei se salvează INTEGRAL (nu ultimele 50) — altfel
      // conversațiile lungi pierdeau primele mesaje la reîncărcare. Contextul
      // trimis către model rămâne limitat la ultimele (slice la trimitere).
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

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
      }
    );
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    return () => {
      keyboardDidHideListener.remove();
      keyboardDidShowListener.remove();
    };
  }, []);

  const executaTrimitereMesaj = async (mesajText: string) => {
    // CHAT-003: gardă anti-concurență la nivelul întregii funcții — acoperă
    // trimitePromptDirect, chip-urile rapide, generatorul de rețete și input-ul.
    // Fără ea se lansa o a doua cerere /chat în timp ce prima era în zbor
    // (răspunsuri în ordine inversă, dublu credit).
    if (loadingRef.current) return;
    if (!mesajText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMesaje(prev => [...prev, { id: newMsgId(), role: 'user', text: mesajText }]);
    setLoadingChat(true);
    loadingRef.current = true;

    if (!session) {
      setMesaje(prev => [...prev, { id: newMsgId(), role: 'ai', isError: true, text: "Nu ești autentificat. Te rog să te conectezi din nou." }]);
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
          setMealProposalVisible(true);
          setMesaje(prev => [...prev, { id: newMsgId(), role: 'ai', text: "Am identificat alimentele! Apasă pe butonul de confirmare care a apărut pe ecran." }]);
          return;
        } catch (errMeal) {
          console.warn('Eroare rută dedicată de masă:', (errMeal as any)?.message || errMeal);
          setMesaje(prev => [...prev, {
            id: newMsgId(),
            role: 'ai',
            isError: true,
            text: (errMeal as any)?.message || "Nu am putut pregăti propunerea de masă. Încearcă din nou, te rog.",
          }]);
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
        setMesaje(prev => [...prev, { id: newMsgId(), role: 'ai', isError: true, text: "Răspuns invalid de la server. Te rog încearcă din nou." }]);
        return;
      }

      if (!raspuns.ok) {
        // Statusurile non-2xx se mapau pe mesaje clare; altfel un 401/429/500
        // apărea ca un răspuns AI normal ("Eroare la procesarea răspunsului.").
        const mesajServer = date?.raspuns || date?.eroare || date?.message;
        let textEroare: string;
        if (raspuns.status === 401) {
          textEroare = "Sesiunea a expirat. Te rog să te autentifici din nou.";
        } else if (raspuns.status === 429) {
          textEroare = mesajServer || "Ai atins limita de cereri AI. Încearcă din nou mai târziu.";
        } else {
          textEroare = mesajServer || "Serverul AI a întâmpinat o problemă. Încearcă din nou peste câteva momente.";
        }
        setMesaje(prev => [...prev, { id: newMsgId(), role: 'ai', isError: true, text: textEroare }]);
        return;
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      let raspunsText = date?.raspuns || "Eroare la procesarea răspunsului.";
      // CHAT-009: `parsed` nu mai e reasignat după eliminarea fallback-ului mort.
      const parsed = parseMealProposal(date) || parseMealProposal(raspunsText);

      // CHAT-009: fallback-ul catre /api/log-food-from-chat de aici era cod mort —
      // daca isMealLogIntent(mesajText) e adevarat, ramura de meal-intent de mai
      // sus iese mereu cu return (try SAU catch), deci nu se ajunge aici; daca e
      // fals, conditia de aici nu putea fi adevarata. Blocul a fost eliminat.

      if (parsed && (parsed.type === 'MEAL_PROPOSAL' || Array.isArray(parsed.items))) {
        if (Array.isArray(parsed.items)) parsed.type = 'MEAL_PROPOSAL';
        setMealProposal(parsed);
        setMealProposalVisible(true);
        raspunsText = "Am identificat alimentele! Apasă pe butonul de confirmare care a apărut pe ecran.";
      }

      setMesaje(prev => [...prev, { id: newMsgId(), role: 'ai', text: raspunsText }]);
    } catch {
      setMesaje(prev => [...prev, { id: newMsgId(), role: 'ai', isError: true, text: "Eroare de conexiune cu serverul AI. Te rog încearcă din nou mai târziu." }]);
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

    setSavingProposal(true);

    try {
      // 3. Inserarea batch a alimentelor o singură dată. Valorile AI sunt
      // normalizate și clampate la limitele CHECK-urilor din Postgres (BUG-007),
      // tip_masa e adus la valorile valide, iar fiecare rând primește un `id`
      // UUID determinist — reluarea aceleiași propuneri se ciocnește pe PK
      // (23505), fără rânduri duplicate.
      const acumMasa = new Date();
      const rows = construiesteRinduriMasaChat({
        user_id: session.user.id,
        items: mealProposal.items,
        now: acumMasa,
        meal_type: mealProposal.meal_type,
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
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMesaje(prev => [...prev, { id: newMsgId(), role: 'ai', text: '✅ Masa a fost confirmată și adăugată cu succes în Jurnal!' }]);
      
    } catch (e: any) {
      console.error('Eroare salvare propunere masă:', e);
      // Dacă eroarea nu e de la Supabase, o prindem aici
      if (!e.message?.includes('Baza de date')) {
          Alert.alert(t('alerts.titluri.eroareSistem'), t('alerts.mesaje.salvareNeprocesata'));
      }
    } finally {
      setSavingProposal(false);
    }
  };

  const trimitePromptDirect = async (mesajText: string) => {
    await executaTrimitereMesaj(mesajText);
  };

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
      { id: newMsgId(), role: 'ai', text: 'Bună! Sunt asistentul tău nutrițional AI. Îți pot sugera mese, analiza dieta de azi sau răspunde la orice întrebare despre nutriție.' }
    ];
    setMesaje(initialMsg);
    await AsyncStorage.removeItem(getChatStorageKey());
    setNewChatModalVisible(false);
    setShowNewChatBanner(true);
    setTimeout(() => setShowNewChatBanner(false), 3200);
  };

  // BUG-010: paddingul de jos al inputului = înălțimea reală a tab-barului (nu
  // constanta 60), cu spațiu de respirație când tastatura e ascunsă.
  const inputBottomPadding = isKeyboardVisible ? 10 : tabBarHeight + 8;

  return (
    <View style={[styles.outerContainer, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accentSecondary }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentTertiary }]} />

      <KeyboardAwareScreen style={styles.container}>

        {/* Header */}
        <Animated.View entering={FadeInDown.duration(500)} style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <View style={styles.headerMainRow}>
            <View style={styles.headerIdentity}>
              <View style={[styles.aiAvatar, { borderColor: colors.accentSecondary + '44' }]}>
                <LinearGradient colors={colors.accentSecondaryGradient} style={styles.aiAvatarGradient}>
                  <Text style={styles.aiAvatarText}>NC</Text>
                </LinearGradient>
              </View>
              <View style={styles.aiMeta}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>NutriAI Coach</Text>
                <Text style={[styles.aiSubtitle, { color: colors.textSecondary }]}>nutriție, mese, progres</Text>
                <View style={styles.onlineRow}>
                  <View style={[styles.onlineDot, { backgroundColor: colors.accent }]} />
                  <Text style={[styles.onlineText, { color: colors.accent }]}>online acum</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleResetChat}
              style={[styles.newChatPill, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
              activeOpacity={0.85}
              hitSlop={{ top: 2, bottom: 2 }}
              accessibilityRole="button"
              accessibilityLabel="Începe o conversație nouă de chat"
            >
              <Text style={[styles.newChatPillText, { color: colors.textPrimary }]}>Chat nou</Text>
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
            <Text style={[styles.newChatBannerText, { color: colors.textPrimary }]}>
              Conversație nouă pornită — Gata să te ajut!
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
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Salut, eu sunt NutriAI Coach</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  Îți pot analiza ziua, sugera mese și ajusta aportul după ce ai mâncat deja.
                </Text>
              </LinearGradient>
            </View>

            <View style={styles.quickActionsList}>
              <TouchableOpacity
                style={[styles.quickActionCard, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                onPress={() => trimitePromptDirect('Analizează mesele mele de azi și spune-mi ce să mai mănânc până diseară.')}
                accessibilityRole="button"
                accessibilityLabel="Analiza zilei: vezi unde ești cu kcal și proteine"
              >
                <BarChart3 size={24} color={colors.textPrimary} />
                <View style={styles.quickActionBody}>
                  <Text style={[styles.quickActionTitle, { color: colors.textPrimary }]}>Analiza zilei</Text>
                  <Text style={[styles.quickActionText, { color: colors.textSecondary }]}>Vezi unde ești cu kcal și proteine</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickActionCard, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                onPress={() => trimitePromptDirect('Sugerează-mi o masă bogată în proteine, sub 600 kcal.')}
                accessibilityRole="button"
                accessibilityLabel="Sugerează o masă bogată în proteine, sub 600 kcal"
              >
                <Dumbbell size={24} color={colors.textPrimary} />
                <View style={styles.quickActionBody}>
                  <Text style={[styles.quickActionTitle, { color: colors.textPrimary }]}>Masă bogată în proteine</Text>
                  <Text style={[styles.quickActionText, { color: colors.textSecondary }]}>Rapid, simplu, util</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickActionCard, { backgroundColor: colors.accent, borderColor: colors.accent }]}
                onPress={() => setRecipeModalVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Deschide generatorul de rețete"
              >
                <ChefHat size={24} color={colors.background} />
                <View style={styles.quickActionBody}>
                  <Text style={[styles.quickActionTitle, { color: colors.background }]}>Generator rețete</Text>
                  <Text style={[styles.quickActionText, { color: colors.background }]}>Rețete după ce ți-a mai rămas azi</Text>
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
              {mesaje.map((msg, index) => (
                <Animated.View
                  key={msg.id ?? `msg-${index}`}
                  entering={FadeIn.duration(400)}
                  style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}
                >
                  {msg.role !== 'user' && (
                    <Text style={[styles.aiBubbleLabel, { color: colors.textTertiary }]}>NutriAI Coach</Text>
                  )}
                  {msg.role === 'user' ? (
                    <LinearGradient colors={colors.accentGradient} style={styles.bubbleContentUser}>
                      <Text style={[styles.textUser, { color: colors.background }]} maxFontSizeMultiplier={1.4}>{msg.text}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.bubbleContentAI, { borderColor: colors.accentSecondary + '40', backgroundColor: colors.surface }]}>
                      <LinearGradient colors={[colors.accentSecondary + '26', 'rgba(0,0,0,0.3)']} style={styles.bubbleContentAIGrad}>
                        <Text style={[styles.textAI, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.4}>{msg.text}</Text>
                      </LinearGradient>
                    </View>
                  )}
                </Animated.View>
              ))}

              {loadingChat && (
                <Animated.View entering={FadeInDown.duration(300)} style={[styles.bubble, styles.bubbleAI]}>
                  <Text style={[styles.aiBubbleLabel, { color: colors.textTertiary }]}>NutriAI Coach</Text>
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
            </ScrollView>

            {/* Quick AI Action Chips in Active Chat */}
            <Animated.View entering={FadeInDown.duration(500).delay(150)} style={styles.chipsRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                <TouchableOpacity
                  style={[styles.actionChip, { backgroundColor: colors.accent, borderColor: colors.accent }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setRecipeModalVisible(true); }}
                  accessibilityRole="button"
                  accessibilityLabel="Generator de rețete"
                >
                  <ChefHat size={14} color={colors.background} />
                  <Text style={[styles.actionChipText, { color: colors.background, fontWeight: '800' }]}>Generator Rețete</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionChip, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => trimitePromptDirect("Ce pot găti rapid și sănătos în mai puțin de 15 minute?")}
                  accessibilityRole="button"
                  accessibilityLabel="Sugerează o cină rapidă, sub 15 minute"
                >
                  <Zap size={14} color={colors.textPrimary} />
                  <Text style={[styles.actionChipText, { color: colors.textPrimary }]}>Cină rapidă (&lt;15 min)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionChip, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => trimitePromptDirect(`Care este cea mai eficientă rețetă bogată în proteine pentru a-mi atinge ținta de ${proteineTinta}g?`)}
                  accessibilityRole="button"
                  accessibilityLabel="Cere o rețetă bogată în proteine"
                >
                  <Dumbbell size={14} color={colors.textPrimary} />
                  <Text style={[styles.actionChipText, { color: colors.textPrimary }]}>Bomba de proteine</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionChip, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => trimitePromptDirect("Analizează mesele mele de azi și dă-mi o evaluare generală și un sfat pentru seară.")}
                  accessibilityRole="button"
                  accessibilityLabel="Analizează ziua curentă în chat"
                >
                  <BarChart3 size={14} color={colors.textPrimary} />
                  <Text style={[styles.actionChipText, { color: colors.textPrimary }]}>Analiză zi curentă</Text>
                </TouchableOpacity>
              </ScrollView>
            </Animated.View>
          </>
        )}

        {/* Input */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(200)}
          style={[styles.inputWrapper, { paddingBottom: inputBottomPadding }]}
        >
          <View style={[styles.inputContainer, { borderColor: colors.accentSecondary + '33', backgroundColor: colors.surfaceElevated }]}>
            <LinearGradient colors={[colors.accentSecondary + '14', 'rgba(0,0,0,0)']} style={styles.inputGrad}>
              <TextInput
                testID="chat-input"
                accessibilityLabel="Scrie un mesaj către NutriAI"
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder="Scrie un mesaj..."
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
                accessibilityLabel="Trimite mesajul"
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
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Începi o conversație nouă?</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Istoricul curent va fi șters din sesiune și vei începe o conversație proaspătă cu asistentul AI.
            </Text>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
                onPress={() => setNewChatModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Anulează conversația nouă"
              >
                <Text style={[styles.modalCancelText, { color: colors.textPrimary }]}>Anulează</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: colors.accentSecondary }]}
                onPress={confirmResetChat}
                accessibilityRole="button"
                accessibilityLabel="Confirmă începerea unei conversații noi"
              >
                <Sparkles size={16} color="#FFF" />
                <Text style={styles.modalConfirmText}>Chat Nou</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmSheet
        visible={mealProposalVisible}
        title="✨ Confirmare Jurnal Alimentar"
        message={mealProposal ? `Alimente: ${mealProposal.items.map(i => `${i.name} (${i.qty}${i.unit})`).join(', ')}\nTotal: ${mealProposal.totals?.kcal || 0} kcal | ${mealProposal.totals?.protein_g || 0}g P` : ''}
        confirmLabel={savingProposal ? 'Se salvează...' : 'Adaugă în Jurnal'}
        cancelLabel="Anulează"
        destructive={false}
        onConfirm={confirmMealProposal}
        onCancel={() => {
          setMealProposalVisible(false);
          setMealProposal(null);
        }}
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
  actionChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1 },
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
});
