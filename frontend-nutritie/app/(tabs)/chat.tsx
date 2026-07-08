import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, Keyboard
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../supabase';
import { API_URL } from '@/constants/config';
import { useFocusEffect } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import { Bot, Send, Sparkles, Refrigerator, Utensils, Flame, Clock } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useMeseAzi } from '../../hooks/useMeseAzi';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import BouncingDot from '../../components/BouncingDot';
import { RecipeGeneratorModal } from '../../components/RecipeGeneratorModal';

interface ChatMessage {
  role: 'ai' | 'user' | string;
  text: string;
}

export default function ChatScreen() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const [chatInput, setChatInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [recipeModalVisible, setRecipeModalVisible] = useState(false);
  const [mesaje, setMesaje] = useState<ChatMessage[]>([
    { role: 'ai', text: 'Bună! Sunt asistentul tău nutrițional AI. Îți pot sugera mese, analiza dieta de azi sau răspunde la orice întrebare despre nutriție.' }
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

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [])
  );

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const saved = await AsyncStorage.getItem('chat_history');
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

  useEffect(() => {
    const saveHistory = async () => {
      try {
        if (mesaje.length > 1) {
          await AsyncStorage.setItem('chat_history', JSON.stringify(mesaje.slice(-50)));
        }
      } catch (e) {
        console.error('Eroare la salvarea istoricului chat:', e);
      }
    };
    saveHistory();
  }, [mesaje]);

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
    setMesaje(prev => [...prev, { role: 'user', text: mesajText }]);
    setLoadingChat(true);

    if (!session) {
      setMesaje(prev => [...prev, { role: 'ai', text: "Nu ești autentificat. Te rog să te conectezi din nou." }]);
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
      setMesaje(prev => [...prev, { role: 'ai', text: date.raspuns || "Eroare la procesarea răspunsului." }]);
    } catch {
      setMesaje(prev => [...prev, { role: 'ai', text: "Eroare de conexiune cu serverul AI. Te rog încearcă din nou mai târziu." }]);
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

  const trimitePromptDirect = async (mesajText: string) => {
    await executaTrimitereMesaj(mesajText);
  };

  const inputBottomPadding = isKeyboardVisible 
    ? 10 
    : (Platform.OS === 'ios' ? 24 : 14);

  return (
    <View style={[styles.outerContainer, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accentSecondary }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentTertiary }]} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>

        {/* Header */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
          <View style={styles.headerLeft}>
            <LinearGradient colors={colors.accentSecondaryGradient} style={styles.botAvatar}>
              <Sparkles size={20} color={colors.textPrimary} />
            </LinearGradient>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Asistent AI</Text>
              <View style={styles.onlineRow}>
                <View style={[styles.onlineDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.onlineText, { color: colors.accent }]}>Online</Text>
              </View>
            </View>
          </View>

          {/* Context chips */}
          <View style={styles.contextRow}>
            <View style={[styles.contextChip, { backgroundColor: colors.accent + '14', borderColor: colors.accent + '26' }]}>
              <Text style={[styles.contextChipText, { color: colors.accent }]}>{totalCalorii} kcal / {caloriiTinta} kcal</Text>
            </View>
          </View>
        </Animated.View>

        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          style={styles.chatScroll}
          contentContainerStyle={{ padding: 20, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {mesaje.map((msg, index) => (
            <Animated.View
              key={index}
              entering={FadeInDown.duration(400).springify()}
              layout={Layout.springify()}
              style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}
            >
              {msg.role === 'ai' && (
                <LinearGradient colors={colors.accentSecondaryGradient} style={styles.botIcon}>
                  <Bot size={16} color={colors.textPrimary} />
                </LinearGradient>
              )}
              {msg.role === 'user' ? (
                <LinearGradient colors={colors.accentGradient} style={styles.bubbleContentUser}>
                  <Text style={[styles.textUser, { color: colors.background }]}>{msg.text}</Text>
                </LinearGradient>
              ) : (
                <BlurView intensity={30} tint="dark" style={[styles.bubbleContentAI, { borderColor: colors.accentSecondary + '26' }]}>
                  <LinearGradient colors={[colors.accentSecondary + '14', 'rgba(0,0,0,0)']} style={styles.bubbleContentAIGrad}>
                    <Text style={[styles.textAI, { color: colors.textPrimary }]}>{msg.text}</Text>
                  </LinearGradient>
                </BlurView>
              )}
            </Animated.View>
          ))}

          {loadingChat && (
            <Animated.View entering={FadeInDown.duration(300)} style={[styles.bubble, styles.bubbleAI]}>
              <LinearGradient colors={colors.accentSecondaryGradient} style={styles.botIcon}>
                <Bot size={16} color={colors.textPrimary} />
              </LinearGradient>
              <BlurView intensity={30} tint="dark" style={[styles.bubbleContentAI, { borderColor: colors.accentSecondary + '26' }]}>
                <LinearGradient colors={[colors.accentSecondary + '14', 'rgba(0,0,0,0)']} style={styles.bubbleContentAIGrad}>
                  <View style={styles.typingRow}>
                    <BouncingDot delay={0} color={colors.accentSecondary} />
                    <BouncingDot delay={150} color={colors.accentSecondary} />
                    <BouncingDot delay={300} color={colors.accentSecondary} />
                  </View>
                </LinearGradient>
              </BlurView>
            </Animated.View>
          )}
        </ScrollView>

        {/* Quick AI Action Chips */}
        <Animated.View entering={FadeInDown.duration(500).delay(150)} style={styles.chipsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
            <TouchableOpacity 
              style={[styles.actionChip, { backgroundColor: colors.accent, borderColor: colors.accent }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setRecipeModalVisible(true); }}
            >
              <Text style={{ fontSize: 14 }}>🥗</Text>
              <Text style={[styles.actionChipText, { color: colors.background, fontWeight: '800' }]}>Generator Rețete</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionChip, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
              onPress={() => trimitePromptDirect("Ce pot găti rapid și sănătos în mai puțin de 15 minute?")}
            >
              <Text style={{ fontSize: 14 }}>⚡</Text>
              <Text style={[styles.actionChipText, { color: colors.textPrimary }]}>Cină rapidă (&lt;15 min)</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionChip, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
              onPress={() => trimitePromptDirect(`Care este cea mai eficientă rețetă bogată în proteine pentru a-mi atinge ținta de ${proteineTinta}g?`)}
            >
              <Text style={{ fontSize: 14 }}>💪</Text>
              <Text style={[styles.actionChipText, { color: colors.textPrimary }]}>Bomba de proteine</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionChip, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
              onPress={() => trimitePromptDirect("Analizează mesele mele de azi și dă-mi o evaluare generală și un sfat pentru seară.")}
            >
              <Text style={{ fontSize: 14 }}>📊</Text>
              <Text style={[styles.actionChipText, { color: colors.textPrimary }]}>Analiză zi curentă</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>

        {/* Input */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(200)}
          style={[styles.inputWrapper, { paddingBottom: inputBottomPadding }]}
        >
          <BlurView intensity={40} tint="dark" style={[styles.inputContainer, { borderColor: colors.accentSecondary + '33' }]}>
            <LinearGradient colors={[colors.accentSecondary + '14', 'rgba(0,0,0,0)']} style={styles.inputGrad}>
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder="Scrie un mesaj..."
                placeholderTextColor={colors.textSecondary}
                value={chatInput}
                onChangeText={setChatInput}
                multiline
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={trimiteMesaj}
                blurOnSubmit={false}
              />
              <TouchableOpacity
                style={[styles.sendBtn, !chatInput.trim() && { opacity: 0.4 }]}
                onPress={trimiteMesaj}
                disabled={loadingChat || !chatInput.trim()}
              >
                <LinearGradient colors={colors.accentGradient} style={styles.sendGrad}>
                  <Send size={18} color={colors.background} strokeWidth={2.5} />
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </BlurView>
        </Animated.View>

      </KeyboardAvoidingView>

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

  header: { paddingTop: Platform.OS === 'ios' ? 44 : 24, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  botAvatar: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  onlineText: { fontSize: 12, fontWeight: '600' },
  contextRow: { flexDirection: 'row', gap: 8 },
  contextChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  contextChipText: { fontSize: 12, fontWeight: '700' },

  chatScroll: { flex: 1 },
  bubble: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
  bubbleUser: { justifyContent: 'flex-end' },
  bubbleAI: { justifyContent: 'flex-start' },
  botIcon: { width: 34, height: 34, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  bubbleContentUser: { padding: 16, borderRadius: 22, borderBottomRightRadius: 6, maxWidth: '78%' },
  bubbleContentAI: { borderRadius: 22, borderBottomLeftRadius: 6, maxWidth: '78%', overflow: 'hidden', borderWidth: 1 },
  bubbleContentAIGrad: { padding: 16 },
  textUser: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  textAI: { fontSize: 15, lineHeight: 22 },
  typingRow: { flexDirection: 'row', gap: 6, paddingVertical: 4, paddingHorizontal: 4 },

  inputWrapper: { paddingHorizontal: 16, paddingTop: 4 },
  inputContainer: { borderRadius: 28, overflow: 'hidden', borderWidth: 1 },
  inputGrad: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingVertical: 8 },
  input: { flex: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, maxHeight: 120, minHeight: 44, fontSize: 16 },
  sendBtn: { width: 44, height: 44, borderRadius: 16, overflow: 'hidden', marginLeft: 8 },
  sendGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  chipsRow: { paddingBottom: 6 },
  chipsScroll: { gap: 8, paddingHorizontal: 16 },
  actionChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1 },
  actionChipText: { fontSize: 12, fontWeight: '700' },
});
