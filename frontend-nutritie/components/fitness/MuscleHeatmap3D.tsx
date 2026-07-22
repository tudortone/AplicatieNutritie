import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import { OrbitControls, useGLTF } from '@react-three/drei/native';
import * as THREE from 'three';
// @ts-ignore
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils';

import type { MuscleId } from './heatColor';
import { heatColor } from './heatColor';
import { muscleForMeshName } from './muscleMeshMap';

type IntensityMap = Partial<Record<MuscleId, number>>;

interface Props {
  intensity: IntensityMap;
  height?: number;
  interactive?: boolean;
  front?: boolean;
  intensityScore?: number;
}

const MODEL = require('../../assets/models/realistic_anatomy.glb');

function toThreeColor(value: string): THREE.Color {
  return new THREE.Color(value);
}

function intensityForMuscle(
  intensity: IntensityMap,
  muscle: MuscleId | null,
): number {
  if (!muscle) return 0;
  return Math.min(Math.max(Number(intensity[muscle] ?? 0), 0), 1);
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (!mesh.isMesh) return;

    mesh.geometry?.dispose();

    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => material.dispose());
    } else {
      mesh.material?.dispose();
    }
  });
}

function prepareHumanModel(
  source: THREE.Object3D,
  intensity: IntensityMap,
): THREE.Object3D {
  const model = cloneSkeleton(source);

  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());

  model.position.sub(center);

  const maxDimension = Math.max(size.x, size.y, size.z);
  const targetHeight = 3.25;
  const scale = maxDimension > 0 ? targetHeight / maxDimension : 1;

  model.scale.setScalar(scale);

  model.traverse((object: any) => {
    const mesh = object as THREE.Mesh;

    if (!mesh.isMesh) return;

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const muscle = muscleForMeshName(mesh.name);
    const value = intensityForMuscle(intensity, muscle);

    const sourceMaterial = Array.isArray(mesh.material)
      ? mesh.material[0]
      : mesh.material;

    const baseColor =
      value > 0.001
        ? toThreeColor(heatColor(value))
        : new THREE.Color('#27313A');

    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.72,
      metalness: 0.04,
      transparent: false,
    });

    if (sourceMaterial instanceof THREE.MeshStandardMaterial) {
      material.roughness = sourceMaterial.roughness;
      material.metalness = sourceMaterial.metalness;
      material.map = sourceMaterial.map;
      material.normalMap = sourceMaterial.normalMap;
    }

    mesh.material = material;
  });

  return model;
}

function HumanModel({ intensity }: { intensity: IntensityMap }) {
  const gltf = useGLTF(MODEL) as unknown as { scene: THREE.Group };

  const model = useMemo(
    () => prepareHumanModel(gltf.scene, intensity),
    [gltf.scene, intensity],
  );

  useEffect(() => {
    return () => {
      disposeObject(model);
    };
  }, [model]);

  return <primitive object={model} />;
}

// Anime Fire Aura rendered behind the 3D anatomy model at position={[0, 0, -1.8]}
function AnimeFireAura({ intensityScore }: { intensityScore: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const t = Math.min(Math.max(intensityScore / 100, 0), 1);

  // Transitioning Yellow (#FFFF00) -> Orange (#FF6600) -> Red (#FF003C) -> Deep Purple (#8A00FF) based on intensity 0->100
  const auraColor = useMemo(() => {
    const c = new THREE.Color('#FFFF00');
    if (t <= 0.333) {
      c.lerp(new THREE.Color('#FF6600'), t * 3);
    } else if (t <= 0.666) {
      c.set('#FF6600').lerp(new THREE.Color('#FF003C'), (t - 0.333) * 3);
    } else {
      c.set('#FF003C').lerp(new THREE.Color('#8A00FF'), (t - 0.666) * 3);
    }
    return c;
  }, [t]);

  // Scale: varies between [2.5, 3.2, 1] and [3.6, 4.5, 1]
  const targetScaleX = 2.5 + t * 1.1;
  const targetScaleY = 3.2 + t * 1.3;
  // Opacity: linear mapping between 0.3 and 0.95
  const targetOpacity = 0.3 + t * 0.65;

  const shaderArgs = useMemo(
    () => ({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: auraColor },
        uOpacity: { value: targetOpacity },
        uIntensity: { value: t },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uIntensity;
        varying vec2 vUv;

        float rand(vec2 n) { 
          return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
        }

        float noise(vec2 p){
          vec2 ip = floor(p);
          vec2 u = fract(p);
          u = u*u*(3.0-2.0*u);
          float res = mix(
            mix(rand(ip), rand(ip+vec2(1.0,0.0)), u.x),
            mix(rand(ip+vec2(0.0,1.0)), rand(ip+vec2(1.0,1.0)), u.x), u.y);
          return res*res;
        }

        void main() {
          vec2 uv = vUv * 2.0 - 1.0;
          float dist = length(uv);
          
          float wave = sin(uv.x * 6.0 + uTime * 4.0) * 0.12 * (1.0 + uIntensity);
          float flameShape = 1.0 - smoothstep(0.2, 0.95, dist + wave + (0.3 - uv.y * 0.3));
          
          float n = noise(uv * 3.5 - vec2(0.0, uTime * 2.5));
          float alpha = flameShape * (0.6 + n * 0.6) * uOpacity;
          
          if (alpha < 0.05) discard;
          
          vec3 finalColor = mix(uColor, vec3(1.0, 0.95, 0.6), smoothstep(0.6, 0.0, dist));
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    }),
    [auraColor, targetOpacity, t]
  );

  useFrame((state, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta;
      materialRef.current.uniforms.uColor.value.copy(auraColor);
      materialRef.current.uniforms.uOpacity.value = targetOpacity;
      materialRef.current.uniforms.uIntensity.value = t;
    }
    if (meshRef.current) {
      meshRef.current.scale.lerp(
        new THREE.Vector3(targetScaleX, targetScaleY, 1),
        0.1
      );
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, -1.8]}>
      <planeGeometry args={[1, 1, 32, 32]} />
      <shaderMaterial ref={materialRef} args={[shaderArgs]} transparent depthWrite={false} />
    </mesh>
  );
}

function LoadingBody({ height }: { height: number }) {
  return (
    <View style={[styles.loading, { height }]}>
      <ActivityIndicator size="large" color="#CCFF00" />
    </View>
  );
}

const R3FCanvas = Canvas as any;

export default function MuscleHeatmap3D({
  intensity,
  height = 390,
  interactive = true,
  intensityScore,
}: Props) {
  const computedScore = useMemo(() => {
    if (typeof intensityScore === 'number') return intensityScore;
    const values = Object.values(intensity || {}).map((v) => Number(v) || 0);
    if (values.length === 0) return 30;
    const maxVal = Math.max(...values);
    return Math.min(100, Math.max(10, Math.round(maxVal * 100)));
  }, [intensityScore, intensity]);

  return (
    <View style={[styles.container, { height }]}>
      <R3FCanvas
        dpr={[1, 1.5]}
        shadows
        camera={{
          position: [0, 0.1, 4.8],
          fov: 34,
          near: 0.01,
          far: 100,
        }}
        onCreated={({ camera }: any) => {
          camera.lookAt(0, 0, 0);
        }}
      >
        <color attach="background" args={['#090C0E']} />

        <ambientLight intensity={1.15} />

        <directionalLight
          castShadow
          position={[2.8, 4.5, 4]}
          intensity={2.1}
          color="#FFFFFF"
        />

        <directionalLight
          position={[-3, 1.5, 2]}
          intensity={0.65}
          color="#7DD3FC"
        />

        <directionalLight
          position={[0, 2, -4]}
          intensity={0.4}
          color="#A855F7"
        />

        <Suspense fallback={<LoadingBody height={height} />}>
          <AnimeFireAura intensityScore={computedScore} />
          <HumanModel intensity={intensity} />
        </Suspense>

        {interactive && (
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            enableDamping
            dampingFactor={0.08}
            minPolarAngle={Math.PI * 0.35}
            maxPolarAngle={Math.PI * 0.65}
            minAzimuthAngle={-Math.PI * 0.45}
            maxAzimuthAngle={Math.PI * 0.45}
          />
        )}
      </R3FCanvas>
    </View>
  );
}

useGLTF.preload(MODEL);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#090C0E',
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#090C0E',
  },
});
