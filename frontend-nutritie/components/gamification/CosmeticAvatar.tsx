import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import type { CosmeticItem } from '../../lib/cosmetics';

export type CosmeticAvatarProps = {
  avatar?: CosmeticItem | null;
  frame?: CosmeticItem | null;
  effect?: CosmeticItem | null;
  imageUri?: string | null;
  initials?: string;
  size?: number;
};

export default function CosmeticAvatar({
  avatar,
  frame,
  effect,
  imageUri,
  initials = 'NA',
  size = 112,
}: CosmeticAvatarProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;
  const sparkle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const orbitLoop = Animated.loop(Animated.timing(orbit, { toValue: 1, duration: 4200, easing: Easing.linear, useNativeDriver: true }));
    const sparkleLoop = Animated.loop(Animated.sequence([
      Animated.timing(sparkle, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(650),
      Animated.timing(sparkle, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]));
    pulseLoop.start();
    orbitLoop.start();
    sparkleLoop.start();
    return () => { pulseLoop.stop(); orbitLoop.stop(); sparkleLoop.stop(); };
  }, [pulse, orbit, sparkle]);

  const frameColors = frame?.colors || ['#CCFF00', '#3BE8B0'];
  const effectColors = effect?.colors || frameColors;
  const frameWidth = frame?.frameStyle === 'double' ? 6 : frame?.frameStyle === 'crown' ? 5 : 4;
  const dashStyle = frame?.frameStyle === 'dashed' ? 'dashed' : 'solid';
  const isGlow = frame?.frameStyle === 'glow' || frame?.frameStyle === 'crown';
  const rotation = orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const effectIcon = effect?.icon || '✨';
  const particles = useMemo(() => [0, 1, 2, 3], []);

  return (
    <View style={[styles.stage, { width: size + 54, height: size + 54 }]} accessibilityLabel={`Avatar cosmetic ${avatar?.name || ''}, ramă ${frame?.name || 'standard'}, efect ${effect?.name || 'fără'}`}>
      {effect ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.aura,
            {
              width: size + 30,
              height: size + 30,
              borderRadius: (size + 30) / 2,
              borderColor: effectColors[0],
              shadowColor: effectColors[1],
              opacity: effect.effectStyle === 'flame' ? 0.75 : 0.48,
              transform: [{ scale: pulseScale }],
            },
          ]}
        />
      ) : null}

      {effect && ['orbit', 'electric', 'sparkle', 'flame'].includes(effect.effectStyle || '') ? (
        <Animated.View pointerEvents="none" style={[styles.orbit, { width: size + 44, height: size + 44, transform: [{ rotate: rotation }] }]}>
          {particles.map((index) => (
            <View
              key={index}
              style={[
                styles.orbitParticle,
                {
                  transform: [
                    { rotate: `${index * 90}deg` },
                    { translateY: -(size + 30) / 2 },
                  ],
                },
              ]}
            >
              <Animated.Text style={[styles.effectIcon, { opacity: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }]}>{effectIcon}</Animated.Text>
            </View>
          ))}
        </Animated.View>
      ) : null}

      {frame?.frameStyle === 'crown' ? <Text style={[styles.crown, { top: 0, fontSize: size * 0.28 }]}>👑</Text> : null}

      <View
        style={[
          styles.frame,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: frameWidth,
            borderColor: frameColors[0],
            borderStyle: dashStyle,
            shadowColor: frameColors[1],
            shadowOpacity: isGlow ? 0.9 : 0.35,
            shadowRadius: isGlow ? 18 : 8,
            elevation: isGlow ? 16 : 8,
            backgroundColor: `${frameColors[1]}33`,
          },
        ]}
      >
        <View style={[styles.inner, { borderRadius: (size - frameWidth * 2) / 2 }]}>
          {avatar ? (
            <Text style={{ fontSize: size * 0.43 }}>{avatar.icon}</Text>
          ) : imageUri ? (
            <Image source={{ uri: imageUri }} resizeMode="cover" style={StyleSheet.absoluteFillObject} />
          ) : (
            <Text style={[styles.initials, { fontSize: size * 0.27, color: frameColors[0] }]}>{initials}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', justifyContent: 'center' },
  aura: { position: 'absolute', borderWidth: 3, shadowOpacity: 0.9, shadowRadius: 18 },
  orbit: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  orbitParticle: { position: 'absolute' },
  effectIcon: { fontSize: 16 },
  crown: { position: 'absolute', zIndex: 8 },
  frame: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  inner: { width: '88%', height: '88%', backgroundColor: '#0F1318', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '900' },
});
