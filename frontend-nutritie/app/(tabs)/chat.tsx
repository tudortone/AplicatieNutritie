
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, Keyboard, Alert, Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '@/constants/config';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useFocusRefresh } from '../../hooks/useFocusRefresh';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOut } from 'react-native-reanimated';
import { Send, Sparkles, RotateCcw, MessageSquarePlus, CheckCircle2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useMeseAzi } from '../../hooks/useMeseAzi';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import BouncingDot from '../../components/BouncingDot';
import { RecipeGeneratorModal } from '../../components/RecipeGeneratorModal';
import { supabase } from '../../supabase';
import { ConfirmSheet } from '../../components/ui/ConfirmSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import KeyboardAwareScreen, { CONTENT_BOTTOM_PADDING } from '@/components/ui/KeyboardAwareScreen';

interface MealProposalItem {
  name: string;
  qty: number;
  unit: string;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  kcal: number;
}
interface MealProposal {
  type: string;
  meal_type?: string;
  items: MealProposalItem[];
  totals: {
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    kcal: number;
  };
}

// Generator de id stabil pentru mesajele de chat (folosit ca `key` in lista).
const newMsgId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface ChatMessage {
  // FIX UI: fara id stabil, key={index} facea Reanimated sa reutilizeze bula
  // gresita la inserarea unui mesaj (animatii care sar, text amestecat).
  id?: string;
  role: 'ai' | 'user' | string;
  text: string;
}

function parseMealProposal(text: any): MealProposal | null {
  if (!text) return null;
  
  let targetObj: any = null;
  if (typeof text === 'object') {
    targetObj = text;
  } else {
    try {
      const stringToParse = String(text);
      const startIndex = stringToParse.indexOf('{');
      const endIndex = stringToParse.lastIndexOf('}');
      if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        targetObj = JSON.parse(stringToParse.substring(startIndex, endIndex + 1));
      }
    } catch (e) {
      console.warn("Eroare parsare JSON meal proposal:", e);
    }
  }

  if (targetObj && Array.isArray(targetObj.items) && targetObj.items.length > 0) {
    let calcKcal = 0, calcP = 0, calcC = 0, calcF = 0;
    targetObj.items.forEach((it: any) => {
      calcKcal += Number(it.kcal || it.calorii || 0);
      calcP += Number(it.protein_g || it.proteine || 0);
      calcC += Number(it.carbs_g || it.carbohidrati || 0);
      calcF += Number(it.fat_g || it.grasimi || 0);
    });

    const totals = (targetObj.totals && Number(targetObj.totals.kcal || 0) > 0)
      ? targetObj.totals
      : { kcal: calcKcal, protein_g: calcP, carbs_g: calcC, fat_g: calcF };

    return {
      type: "MEAL_PROPOSAL",
      meal_type: targetObj.meal_type || "gustare",
      items: targetObj.items.map((it: any) => ({
        name: it.name || it.nume || "Aliment",
        qty: Number(it.qty || it.grame || 100),
        unit: it.unit || "g",
        protein_g: Number(it.protein_g || it.proteine || 0),
        carbs_g: Number(it.carbs_g || it.carbohidrati || 0),
        fat_g: Number(it.fat_g || it.grasimi || 0),
        // FIX: fiber_g era pierdut aici, deci la salvare câmpul rămânea mereu 0.
        fiber_g: Number(it.fiber_g || it.fibre || 0),
        kcal: Number(it.kcal || it.calorii || 0)
      })),
      totals
    };
  }
  return null;
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
  const insets = useSafeAreaInsets();
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

  const getChatStorageKey = () => `chat_history_${session?.user?.id || 'anon'}`;

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const storageKey = getChatStorageKey();
        const saved = await AsyncStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMesaje(parsed);
          }
        }
      } catch (e) {
        console.error('Eroare la încărcarea istoricului chat:', e);
      }
    };
    loadHistory();
  }, []);

  // Salvare istoric debounce-uită (800ms): la mesaje succesive rapide scriem o
  // singură dată în AsyncStorage, iar la unmount golitm orice salvare restantă.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (mesaje.length <= 1) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      AsyncStorage.setItem(getChatStorageKey(), JSON.stringify(mesaje.slice(-50))).catch((e) =>
        console.error('Eroare la salvarea istoricului chat:', e),
      );
    }, 800);
  }, [mesaje]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        const restant = mesajeRef.current.slice(-50);
        if (restant.length > 1) {
          AsyncStorage.setItem(getChatStorageKey(), JSON.stringify(restant)).catch((e) =>
            console.error('Eroare la salvarea istoricului chat:', e),
          );
        }
      }
    };
  }, []);

  useEffect(() => {
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
    if (!mesajText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMesaje(prev => [...prev, { id: newMsgId(), role: 'user', text: mesajText }]);
    setLoadingChat(true);

    if (!session) {
      setMesaje(prev => [...prev, { id: newMsgId(), role: 'ai', text: "Nu ești autentificat. Te rog să te conectezi din nou." }]);
      setLoadingChat(false);
      return;
    }

    try {
      const istoricActivat = [...mesajeRef.current, { role: 'user' as const, text: mesajText }];
      const raspuns = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          mesaj: mesajText,
          mesaje: istoricActivat,
          caloriiConsumate: totalCalorii,
          caloriiTinta,
          proteineConsumate: totalProteine,
          proteineTinta
        }),
      });
      const date = await raspuns.json();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      let raspunsText = date.raspuns || "Eroare la procesarea răspunsului.";
      let parsed = parseMealProposal(date) || parseMealProposal(raspunsText);

      if (!parsed && isMealLogIntent(mesajText)) {
        try {
          const logResp = await fetch(`${API_URL}/api/log-food-from-chat`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ mesaj: mesajText, mesaje: istoricActivat }),
          });
          if (logResp.ok) {
            const logDate = await logResp.json();
            parsed = parseMealProposal(logDate) || parseMealProposal(logDate.raspuns);
          }
        } catch (errLog) {
          console.warn('Eroare fallback /api/log-food-from-chat:', errLog);
        }
      }

      if (parsed && (parsed.type === 'MEAL_PROPOSAL' || Array.isArray(parsed.items))) {
        if (Array.isArray(parsed.items)) parsed.type = 'MEAL_PROPOSAL';
        setMealProposal(parsed);
        setMealProposalVisible(true);
        raspunsText = "Am identificat alimentele! Apasă pe butonul de confirmare care a apărut pe ecran.";
      }

      setMesaje(prev => [...prev, { id: newMsgId(), role: 'ai', text: raspunsText }]);
    } catch {
      setMesaje(prev => [...prev, { id: newMsgId(), role: 'ai', text: "Eroare de conexiune cu serverul AI. Te rog încearcă din nou mai târziu." }]);
    } finally {
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
      // 2. Extractor brutal de numere (scoate 'g', 'kcal', spații etc.)
      const parseStrictNumber = (val: any) => {
        if (val === undefined || val === null) return 0;
        const numStr = String(val).replace(/[^0-9.-]+/g, "");
        const parsed = Number(numStr);
        return isNaN(parsed) ? 0 : parsed;
      };

      // 3. Inserarea batch a tuturor alimentelor o singură dată
      const tipMasa = mealProposal.meal_type || 'gustare';
      // FIX: coloanele `data` si `ora` ramaneau mereu NULL (doar created_at era populat),
      // iar valorile halucinate de AI puteau depasi CHECK-urile din Postgres (calorii <= 15000,
      // macro <= 2000) => insert respins cu eroare bruta afisata utilizatorului.
      const acumMasa = new Date();
      const ziLocala = `${acumMasa.getFullYear()}-${String(acumMasa.getMonth() + 1).padStart(2, '0')}-${String(acumMasa.getDate()).padStart(2, '0')}`;
      const oraLocala = acumMasa.toTimeString().slice(0, 8);
      const clampVal = (v: number, max: number) => Math.max(0, Math.min(max, Number.isFinite(v) ? v : 0));
      const rows = mealProposal.items.map((item: any) => ({
        user_id: session.user.id,
        nume: `${item.name} (${item.qty}${item.unit || 'g'})`,
        calorii: clampVal(Math.round(parseStrictNumber(item.kcal)), 15000), // Caloriile rămân rotunjite
        proteine: clampVal(parseStrictNumber(item.protein_g), 2000), // Păstrăm zecimalele
        carbohidrati: clampVal(parseStrictNumber(item.carbs_g), 2000),
        grasimi: clampVal(parseStrictNumber(item.fat_g), 2000),
        // Salveaza si fibrele din propunerea AI în propunerea AI dar nu era salvat → câmpul rămânea 0
        fibre: clampVal(Math.round(parseStrictNumber(item.fiber_g)), 2000),
        data: ziLocala,
        ora: oraLocala,
        tip_masa: tipMasa,
      }));

      const { error } = await supabase.from('mese').insert(rows);

      if (error) {
        console.error("Eroare Supabase:", error);
        Alert.alert(t('alerts.titluri.eroareLaSalvare'), t('alerts.mesaje.bazaDateRefuza', { eroare: error.message }));
        throw error;
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

  const inputBottomPadding = isKeyboardVisible ? 10 : insets.bottom + 60;

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
            contentContainerStyle={[styles.emptyChatContainer, { paddingBottom: CONTENT_BOTTOM_PADDING }]}
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
                <Text style={styles.quickActionEmoji}>📊</Text>
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
                <Text style={styles.quickActionEmoji}>💪</Text>
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
                <Text style={styles.quickActionEmoji}>🥗</Text>
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
                paddingBottom: CONTENT_BOTTOM_PADDING,
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
                      <Text style={[styles.textUser, { color: colors.background }]}>{msg.text}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.bubbleContentAI, { borderColor: colors.accentSecondary + '40', backgroundColor: colors.surface }]}>
                      <LinearGradient colors={[colors.accentSecondary + '26', 'rgba(0,0,0,0.3)']} style={styles.bubbleContentAIGrad}>
                        <Text style={[styles.textAI, { color: colors.textPrimary }]}>{msg.text}</Text>
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
                  <Text style={{ fontSize: 14 }}>🥗</Text>
                  <Text style={[styles.actionChipText, { color: colors.background, fontWeight: '800' }]}>Generator Rețete</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionChip, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => trimitePromptDirect("Ce pot găti rapid și sănătos în mai puțin de 15 minute?")}
                  accessibilityRole="button"
                  accessibilityLabel="Sugerează o cină rapidă, sub 15 minute"
                >
                  <Text style={{ fontSize: 14 }}>⚡</Text>
                  <Text style={[styles.actionChipText, { color: colors.textPrimary }]}>Cină rapidă (&lt;15 min)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionChip, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => trimitePromptDirect(`Care este cea mai eficientă rețetă bogată în proteine pentru a-mi atinge ținta de ${proteineTinta}g?`)}
                  accessibilityRole="button"
                  accessibilityLabel="Cere o rețetă bogată în proteine"
                >
                  <Text style={{ fontSize: 14 }}>💪</Text>
                  <Text style={[styles.actionChipText, { color: colors.textPrimary }]}>Bomba de proteine</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionChip, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => trimitePromptDirect("Analizează mesele mele de azi și dă-mi o evaluare generală și un sfat pentru seară.")}
                  accessibilityRole="button"
                  accessibilityLabel="Analizează ziua curentă în chat"
                >
                  <Text style={{ fontSize: 14 }}>📊</Text>
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

  header: {
    paddingTop: Platform.OS === 'ios' ? 44 : 24,
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
  quickActionEmoji: {
    fontSize: 24,
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
