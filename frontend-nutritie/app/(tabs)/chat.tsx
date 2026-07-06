import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, Keyboard
} from 'react-native';
import { supabase } from '../../supabase';
import { API_URL } from '@/constants/config';
import { useFocusEffect } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import { Bot, Send, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useMeseAzi } from '../../hooks/useMeseAzi';
import { useTheme } from '../../context/ThemeContext';
import BouncingDot from '../../components/BouncingDot';

export default function ChatScreen() {
  const { colors } = useTheme();
  const [chatInput, setChatInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [mesaje, setMesaje] = useState([
    { role: 'ai', text: 'Bună! Sunt asistentul tău nutrițional AI. Îți pot sugera mese, analiza dieta de azi sau răspunde la orice întrebare despre nutriție.' }
  ]);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  
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
    }, [refresh])
  );

  React.useEffect(() => {
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

  const trimiteMesaj = async () => {
    if (!chatInput.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const inputCurent = chatInput;
    setChatInput('');
    setMesaje(prev => [...prev, { role: 'user', text: inputCurent }]);
    setLoadingChat(true);

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("Eroare sesiune chat:", sessionError);
    }
    if (!session) {
      setMesaje(prev => [...prev, { role: 'ai', text: "Nu ești autentificat. Te rog să te conectezi din nou." }]);
      setLoadingChat(false);
      return;
    }

    try {
      const raspuns = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          mesaj: inputCurent,
          mesaje: [...mesaje, { role: 'user', text: inputCurent }],
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

  const inputBottomPadding = isKeyboardVisible 
    ? 10 
    : (Platform.OS === 'ios' ? 64 : 40);

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
});
