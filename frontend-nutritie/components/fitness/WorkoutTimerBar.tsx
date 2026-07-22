import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Play, Pause, Square } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';

const TIMER_STORAGE_KEY = 'nutriai_active_workout_timer';
const DEFAULT_TARGET_MINUTES = 45;

interface Props {
  onLogWorkout?: (durataMin: number) => void;
}

export const WorkoutTimerBar: React.FC<Props> = ({ onLogWorkout }) => {
  const { colors } = useTheme();
  const [isRunning, setIsRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [targetMinutes, setTargetMinutes] = useState(DEFAULT_TARGET_MINUTES);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Încărcare din stocare (ca să nu se piardă dacă ieși și reintri pe ecran/aplicație)
  useEffect(() => {
    const loadTimer = async () => {
      try {
        const raw = await AsyncStorage.getItem(TIMER_STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          if (data.isRunning && data.lastTimestamp) {
            const diffSec = Math.floor((Date.now() - data.lastTimestamp) / 1000);
            setSeconds((data.seconds || 0) + diffSec);
            setIsRunning(true);
          } else {
            setSeconds(data.seconds || 0);
            setIsRunning(false);
          }
          if (data.targetMinutes) setTargetMinutes(data.targetMinutes);
        }
      } catch (e) {
        console.warn('Eroare încărcare timer antrenament:', e);
      }
    };
    loadTimer();
  }, []);

  // Salvare stocare la fiecare secundă / schimbare de stare
  useEffect(() => {
    const saveTimer = async () => {
      try {
        await AsyncStorage.setItem(
          TIMER_STORAGE_KEY,
          JSON.stringify({
            isRunning,
            seconds,
            targetMinutes,
            lastTimestamp: Date.now(),
          })
        );
      } catch {}
    };
    saveTimer();
  }, [isRunning, seconds, targetMinutes]);

  // Cronometru activ
  useEffect(() => {
    let interval: any = null;
    if (isRunning) {
      interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } else if (!isRunning && seconds !== 0) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRunning, seconds]);

  // Animație pulsație punct roșu / accent când e activ
  useEffect(() => {
    if (isRunning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRunning]);

  // Calcul bară progres
  const targetSeconds = targetMinutes * 60;
  const progressRatio = Math.min(1, seconds / targetSeconds);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressRatio,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [progressRatio]);

  const togglePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsRunning(!isRunning);
  };

  const handleStopAndReset = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "Oprește antrenamentul",
      `Timp scurs: ${formatTime(seconds)}. Ce dorești să faci?`,
      [
        {
          text: "Anulează",
          style: "cancel"
        },
        {
          text: "doar Reset",
          style: "destructive",
          onPress: async () => {
            setIsRunning(false);
            setSeconds(0);
            await AsyncStorage.removeItem(TIMER_STORAGE_KEY);
          }
        },
        {
          text: "Salvează și Oprește",
          onPress: async () => {
            setIsRunning(false);
            const minFinal = Math.max(1, Math.round(seconds / 60));
            setSeconds(0);
            await AsyncStorage.removeItem(TIMER_STORAGE_KEY);
            if (onLogWorkout) {
              onLogWorkout(minFinal);
            }
          }
        }
      ]
    );
  };

  const formatTime = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%']
  });

  return (
    <View style={styles.outerContainer}>
      <BlurView intensity={35} tint="dark" style={[styles.card, { borderColor: isRunning ? colors.accent : 'rgba(255,255,255,0.1)' }]}>
        {/* Bară vizuală de progres (ca un bar de design la baza cardului) */}
        <View style={styles.progressBarBg}>
          <Animated.View style={[styles.progressBarFill, { width: progressWidth }]}>
            <LinearGradient
              colors={isRunning ? [colors.accent, '#00F0FF'] : ['#6B7280', '#4B5563']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>

        <View style={styles.contentRow}>
          <View style={styles.timerInfoRow}>
            <Animated.View
              style={[
                styles.recordingDot,
                {
                  backgroundColor: isRunning ? '#FF0055' : colors.textSecondary,
                  opacity: pulseAnim
                }
              ]}
            />
            <View>
              <Text style={styles.timerLabel}>
                {isRunning ? 'ANTRENAMENT IN DESFASURARE' : seconds > 0 ? 'ANTRENAMENT IN PAUZA' : 'TIMER ANTRENAMENT'}
              </Text>
              <Text style={[styles.timerValue, { color: isRunning ? colors.accent : colors.textPrimary }]}>
                {formatTime(seconds)}
                <Text style={styles.timerTarget}> / {targetMinutes}m</Text>
              </Text>
            </View>
          </View>

          <View style={styles.controlsRow}>
            {seconds > 0 && (
              <TouchableOpacity
                style={[styles.btnIcon, { backgroundColor: 'rgba(255, 59, 48, 0.15)' }]}
                onPress={handleStopAndReset}
              >
                <Square size={16} color="#FF3B30" fill="#FF3B30" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.btnPlayPause,
                {
                  backgroundColor: isRunning ? 'rgba(255,255,255,0.15)' : colors.accent,
                  shadowColor: colors.accent
                }
              ]}
              onPress={togglePlayPause}
            >
              {isRunning ? (
                <Pause size={20} color={colors.textPrimary} fill={colors.textPrimary} />
              ) : (
                <Play size={20} color="#000" fill="#000" style={{ marginLeft: 2 }} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 20,
    overflow: 'hidden',
  },
  card: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 20,
    backgroundColor: 'rgba(26, 26, 36, 0.85)',
    position: 'relative',
    overflow: 'hidden',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  timerLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 1,
  },
  timerValue: {
    fontSize: 22,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  timerTarget: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  btnIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPlayPause: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  progressBarBg: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  progressBarFill: {
    height: 4,
    borderRadius: 2,
  },
});
