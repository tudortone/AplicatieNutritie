
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator, Pressable, Text, View, StyleSheet, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform, Linking,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useNavigation } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabase';
import { API_URL } from '@/constants/config';
import { API_PREFIX } from '@/lib/api';
import Animated, { FadeIn, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { Scan, Zap, Trash2, Image as ImageIcon, ChevronDown, AlertTriangle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { MEAL_CATEGORIES, CATEGORIE_ICONA, getTipMasaDupaOra, insereazaMasaCuPoza } from '../lib/mealUtils';
import { clasificaRezultatInsertMasa, construiestePayloadMasaCamera, esteEroareDuplicate, eliminaAlimentScanat, verificaReluareMasa } from '../lib/payloadMese';
import { idOperatieNoua } from '@/lib/idUtils';
import { marcheazaMeseModificate } from '@/lib/freshnessMese';
import { GramInput } from '../components/ui/GramInput';
import { type AlimentScanat } from '@/components/food/FoodScanSuccessModal';
import type { TipMasa } from '../types';
import { FontSize } from '../constants/theme';
import IngredientCorrectionInput from '@/components/food/IngredientCorrectionInput';
import { FlowIcon } from '../components/ui/FlowIcon';
import { uploadImageToImageKit } from '@/lib/imagekit';
import { useFlowCredits } from '../context/FlowCreditsContext';
import { FlowCreditsPill } from '@/components/FlowCreditsPill';
import { optimizeImageBeforeUpload, saveLocalImageDraft, discardLocalImageDraft, listPendingDrafts, amprentaOperatieFoto } from '@/lib/imageOptimizer';
import { pushOfflineMealVerificat, processOfflineQueue, MasaOfflinePayload } from '@/lib/offlineQueue';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { MealSaveSuccessModal, type MealSuccessData } from '../components/ui/MealSaveSuccessModal';
import {
  clearActivePhotoJob,
  recoverPhotoJob,
  submitPhotoJob,
  waitForPhotoJob,
  PhotoApiError,
  type ActivePhotoJobPointer,
  type PhotoJob,
} from '@/lib/photoJobs';
import {
  evaluatePhotoMealQuality,
  inferCanonicalMealType,
  normalizePhotoResultItems,
} from '@/lib/photoResultQuality';


export default function CameraScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  // Dimensiuni reactive (fold/unfold pe dispozitive); scan box limitat la 48%
  // din inaltime sau 360px ca sa nu depaseasca ecranul pe telefoane mici/landscape.
  const scanBoxSize = Math.round(Math.min(width * 0.78, height * 0.48, 360));
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const flowCredits = useFlowCredits();

  const scanSteps = useMemo(() => [
    t('camera.steps.optimizing'),
    t('camera.steps.sending'),
    t('camera.steps.identifying'),
    t('camera.steps.calculating'),
  ], [t]);

  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  
  const [rezultat, setRezultat] = useState<AlimentScanat[]>([]);
  const ingredienteIdentificate = rezultat;
  const setIngredienteIdentificate = setRezultat;
  const [isSavingDiary, setIsSavingDiary] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [seIncarca, setSeIncarca] = useState(false);
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const [mealCorrectionOpen, setMealCorrectionOpen] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [photoPhase, setPhotoPhase] = useState<'idle' | 'uploading' | 'processing' | 'background' | 'retrying' | 'completed' | 'failed'>('idle');
  const [failedPhotoJob, setFailedPhotoJob] = useState<{ job: PhotoJob; pointer: ActivePhotoJobPointer } | null>(null);
  // REMED-009: categoria mesei scanate — implicit = sugestia după oră, dar
  // utilizatorul o poate suprascrie din chip-urile din foaia de review.
  const [tipMasaSelectat, setTipMasaSelectat] = useState<TipMasa>(() => getTipMasaDupaOra(new Date()));
  const [saveSuccessData, setSaveSuccessData] = useState<MealSuccessData | null>(null);

  const handleSaveSuccessDismiss = useCallback(() => {
    setSaveSuccessData(null);
    permitereNavigareRef.current = true;
    router.replace('/(tabs)');
  }, [router]);
  const cameraRef = useRef<CameraView>(null);
  // P1-01: identitatea acțiunii de salvare în jurnal (nu a analizei AI).
  const idOperatieSalvareRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  // URL-ul pozei incarcate pe ImageKit CDN dupa un scan reusit (salvat in alimente JSONB).
  const imageKitUrlRef = useRef<string | null>(null);
  // fileId-ul ImageKit al pozei scanate: persistat in alimente JSONB ca stergearea
  // GDPR sa poata identifica si sterge assetul media de pe CDN (nu doar URL-ul).
  const imageKitFileIdRef = useRef<string | null>(null);
  // CAM-003: generația uploadului ImageKit curent + promisiunea lui. Un upload
  // mai vechi care se termină târziu nu mai suprascrie refs-urile după un nou scan.
  const uploadGenerationRef = useRef(0);
  const currentPhotoJobIdRef = useRef<string | null>(null);
  const draftCurrentUriRef = useRef<string | null>(null);
  // U-03: garanteaza ca dialogul de recuperare a draft-ului apare o singura data
  // pe sesiunea ecranului, chiar daca efectul se re-executa la schimbarea tokenului.
  const draftPromptAfisatRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // CAM-007: la unmount anulăm analiza în zbor — fără fetch orfan după
      // părăsirea ecranului (fără setState-after-unmount, fără rețea risipită).
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seIncarca) {
      setScanStepIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setScanStepIndex((prev) => (prev < scanSteps.length - 1 ? prev + 1 : prev));
    }, 1800);

    return () => clearInterval(interval);
  }, [seIncarca, scanSteps.length]);

  useEffect(() => {
    if (session?.user?.id) {
      processOfflineQueue(supabase).catch(() => {});
    }
  }, [session?.user?.id]);


  const updateIngredient = useCallback(
    (index: number, patch: Partial<AlimentScanat>) => {
      setRezultat((current) =>
        current.map((ingredient, itemIndex) =>
          itemIndex === index ? { ...ingredient, ...patch } : ingredient,
        ),
      );
    },
    [],
  );

  // BUG-015: eliminarea unui singur aliment detectat greșit, fără să dispară restul.
  const stergeIngredient = useCallback((index: number) => {
    setRezultat((current) => eliminaAlimentScanat(current, index));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const applyPhotoJobResult = useCallback((job: PhotoJob, pointer?: ActivePhotoJobPointer | null) => {
    if (!job.result?.success || !Array.isArray(job.result.items)) {
      throw new PhotoApiError(502, 'INVALID_PHOTO_JOB_RESULT');
    }
    const normalized = normalizePhotoResultItems(job.result.items);
    if (normalized.length === 0) throw new PhotoApiError(422, 'PHOTO_RESULT_EMPTY');

    imageKitUrlRef.current = pointer?.imageUrl || job.imageUrl || imageKitUrlRef.current;
    imageKitFileIdRef.current = pointer?.imageFileId || job.imageFileId || imageKitFileIdRef.current;
    currentPhotoJobIdRef.current = job.id;
    const capturedAt = pointer?.savedAt ? new Date(pointer.savedAt) : new Date();
    setTipMasaSelectat(inferCanonicalMealType({
      aiMealType: job.result.tipMasa,
      capturedAt,
    }));
    setMealCorrectionOpen(false);
    setRezultat(normalized);
    setPhotoPhase('completed');
    setFailedPhotoJob(null);
  }, []);

  const analizeazaImaginea = useCallback(async (imageUri: string, isRetry = false) => {
    if (!session?.access_token || !session.user.id) {
      setScanError(t('alerts.mesaje.sesiuneExpirata'));
      return;
    }
    abortControllerRef.current?.abort();
    uploadGenerationRef.current += 1;
    imageKitUrlRef.current = null;
    imageKitFileIdRef.current = null;
    currentPhotoJobIdRef.current = null;
    setFailedPhotoJob(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setScanError(null);
    setRezultat([]);
    setSeIncarca(true);
    setPhotoPhase(isRetry ? 'retrying' : 'uploading');
    let timeoutDepasit = false;
    let activePointer: ActivePhotoJobPointer | null = null;
    const backgroundId = setTimeout(() => {
      if (!controller.signal.aborted) setPhotoPhase('background');
    }, 15000);
    const timeoutId = setTimeout(() => {
      timeoutDepasit = true;
      setPhotoPhase('background');
      controller.abort();
    }, 75000);

    try {
      const imagineOptimizata = await optimizeImageBeforeUpload(imageUri);
      const draftPersistentUri = await saveLocalImageDraft(imagineOptimizata.uri, session.user.id);
      draftCurrentUriRef.current = draftPersistentUri;

      const amprentaBaza = await amprentaOperatieFoto(
        imagineOptimizata.uri,
        'auto',
        i18n.language || 'ro',
      );
      const amprentaOperatie = isRetry
        ? `${amprentaBaza}:retry:${idOperatieNoua()}`
        : amprentaBaza;

      const uploaded = await uploadImageToImageKit(
        imagineOptimizata.uri,
        'mancare.jpg',
        controller.signal,
        { skipOptimization: true },
      );
      if (controller.signal.aborted || uploadGenerationRef.current === 0) return;
      imageKitUrlRef.current = uploaded.url;
      imageKitFileIdRef.current = uploaded.fileId;
      setPhotoPhase(isRetry ? 'retrying' : 'processing');

      const submitted = await submitPhotoJob({
        token: session.access_token,
        userId: session.user.id,
        imageUrl: uploaded.url,
        imageFileId: uploaded.fileId,
        analysisId: amprentaOperatie,
        mealType: getTipMasaDupaOra(new Date()),
        language: i18n.language || 'ro',
        localImageUri: imagineOptimizata.uri,
        draftUri: draftPersistentUri,
        signal: controller.signal,
      });
      currentPhotoJobIdRef.current = submitted.id;
      activePointer = {
        userId: session.user.id,
        jobId: submitted.id,
        imageUrl: uploaded.url,
        imageFileId: uploaded.fileId,
        localImageUri: imagineOptimizata.uri,
        draftUri: draftPersistentUri,
        savedAt: Date.now(),
      };
      const completed = await waitForPhotoJob({
        token: session.access_token,
        userId: session.user.id,
        jobId: submitted.id,
        signal: controller.signal,
      });
      applyPhotoJobResult(completed, activePointer);

      await discardLocalImageDraft(draftPersistentUri, session.user.id).catch(() => {});
      if (draftCurrentUriRef.current === draftPersistentUri) draftCurrentUriRef.current = null;

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void flowCredits.refresh();
    } catch (error) {
      if (abortControllerRef.current !== controller) return;
      if (error instanceof PhotoApiError && (
        error.code === 'FLOW_CREDITS_EXHAUSTED'
        || error.code === 'FLOW_CREDITS_UNAVAILABLE'
        || error.code === 'PREMIUM_FAIR_USE_REACHED'
      )) {
        const quotaMsg = t('camera.quotaExceededMessage');
        setScanError(quotaMsg);
        Alert.alert(t('camera.quotaExceededTitle'), quotaMsg, [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('camera.openCredits'), onPress: () => flowCredits.open() },
        ]);
        return;
      }
      if (timeoutDepasit) {
        setPhotoPhase('background');
        setScanError(null);
        return;
      }
      if (error instanceof PhotoApiError && error.status === 422 && activePointer) {
        setPhotoPhase('failed');
        setFailedPhotoJob({
          job: { id: activePointer.jobId, status: 'failed', errorCode: error.code },
          pointer: activePointer,
        });
        return;
      }
      setPhotoPhase('failed');
      setScanError(
        error instanceof PhotoApiError
          ? t('camera.genericScanError')
          : error instanceof Error
            ? error.message
            : t('camera.genericScanError'),
      );
    } finally {
      clearTimeout(backgroundId);
      clearTimeout(timeoutId);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        if (isMountedRef.current) setSeIncarca(false);
      }
    }
  }, [applyPhotoJobResult, flowCredits, i18n.language, session?.access_token, session?.user?.id, t]);

  // Un job Photo AI este recuperabil după închiderea aplicației. Analiza rămâne
  // în Trigger; acest ecran doar reia polling-ul și reconstruiește review-ul.
  useEffect(() => {
    if (!session?.access_token || !session.user.id) return;
    const controller = new AbortController();
    const token = session.access_token;
    const userId = session.user.id;

    const recover = async () => {
      try {
        const active = await recoverPhotoJob({ token, userId, signal: controller.signal });
        if (!active || controller.signal.aborted) return;
        currentPhotoJobIdRef.current = active.job.id;
        imageKitUrlRef.current = active.pointer.imageUrl || active.job.imageUrl || null;
        imageKitFileIdRef.current = active.pointer.imageFileId || active.job.imageFileId || null;
        if (active.job.status === 'failed' || active.job.status === 'cancelled') {
          setPhotoPhase('failed');
          setFailedPhotoJob(active);
          return;
        }
        setSeIncarca(true);
        setPhotoPhase(active.job.status === 'succeeded' || active.job.status === 'completed' ? 'completed' : 'background');
        const completed = active.job.status === 'succeeded' || active.job.status === 'completed'
          ? active.job
          : await waitForPhotoJob({
            token, userId, jobId: active.job.id, signal: controller.signal,
          });
        if (!controller.signal.aborted) applyPhotoJobResult(completed, active.pointer);
        if (active.pointer.draftUri) {
          await discardLocalImageDraft(active.pointer.draftUri, userId).catch(() => {});
        }
      } catch (error) {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) {
          setPhotoPhase('failed');
          setScanError(t('camera.genericScanError'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setSeIncarca(false);
          setRecoveryChecked(true);
        }
      }
    };
    void recover();
    return () => controller.abort();
  }, [applyPhotoJobResult, session?.access_token, session?.user.id, t]);

  const retryFailedPhotoJob = useCallback(async () => {
    if (!failedPhotoJob || !session?.user.id) return;
    const retryUri = failedPhotoJob.pointer.draftUri || failedPhotoJob.pointer.localImageUri;
    if (!retryUri) {
      setFailedPhotoJob(null);
      setPhotoPhase('idle');
      return;
    }
    await clearActivePhotoJob(session.user.id, failedPhotoJob.job.id).catch(() => {});
    setFailedPhotoJob(null);
    await analizeazaImaginea(retryUri, true);
  }, [analizeazaImaginea, failedPhotoJob, session?.user.id]);

  // U-03: recuperarea draft-urilor neanalizate.
  //
  // Efectul stă DUPĂ `analizeazaImaginea` intenționat: referirea ei în dep array
  // înaintea declarației `const` ar arunca ReferenceError (temporal dead zone).
  useEffect(() => {
    if (!recoveryChecked) return;
    if (draftPromptAfisatRef.current) return;
    if (!session?.access_token || !session.user.id || seIncarca || rezultat.length > 0) return;
    draftPromptAfisatRef.current = true;

    listPendingDrafts(session.user.id)
      .then((pending) => {
        if (pending.length === 0 || !isMountedRef.current) return;
        const ultimulDraft = pending[pending.length - 1];
        Alert.alert(
          t('camera.pendingDraftTitle'),
          t('camera.pendingDraftMessage'),
          [
            {
              text: t('alerts.butoane.anuleaza'),
              style: 'destructive',
              onPress: () => {
                discardLocalImageDraft(ultimulDraft, session.user.id).catch(() => {});
              },
            },
            {
              text: t('camera.resumeAnalysis'),
              onPress: () => {
                analizeazaImaginea(ultimulDraft);
              },
            },
          ],
        );
      })
      .catch(() => {});
  }, [session?.access_token, session?.user.id, analizeazaImaginea, recoveryChecked, rezultat.length, seIncarca, t]);

  const anuleazaScanarea = useCallback(() => {
    if (draftCurrentUriRef.current && session?.user.id) {
      discardLocalImageDraft(draftCurrentUriRef.current, session.user.id).catch(() => {});
      draftCurrentUriRef.current = null;
    }
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    imageKitUrlRef.current = null;
    imageKitFileIdRef.current = null;
    if (currentPhotoJobIdRef.current && session?.user.id) {
      clearActivePhotoJob(session.user.id, currentPhotoJobIdRef.current).catch(() => {});
    }
    currentPhotoJobIdRef.current = null;
    setRezultat([]);
    setMealCorrectionOpen(false);
    setScanError(null);
    setSeIncarca(false);
    setPhotoPhase('idle');
    setFailedPhotoJob(null);
    idOperatieSalvareRef.current = null;
  }, [session?.user.id]);

  const lasaAnalizaInFundal = useCallback(() => {
    if (!currentPhotoJobIdRef.current) return false;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setSeIncarca(false);
    setPhotoPhase('background');
    return true;
  }, []);

  // BUG-065: pe Android, butonul/gestul „Înapoi" peste modalul fullScreen ejecta
  // ecranul direct, aruncând un scan în review fără confirmare și fără să
  // șteargă draftul persistent local. Gardul beforeRemove confirmă renunțarea;
  // `permiteNavigareRef` marchează navigările INTENȚIONATE (X, salvare reușită,
  // confirmare din dialog) ca să nu fie interceptate de propriul dialog.
  const permitereNavigareRef = useRef(false);
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (permitereNavigareRef.current) {
        permitereNavigareRef.current = false;
        return;
      }
      if (seIncarca && lasaAnalizaInFundal()) return;
      const deConfirmat = rezultat.length > 0 || seIncarca;
      if (!deConfirmat) return;
      e.preventDefault();
      Alert.alert(
        t('camera.discardScanTitle'),
        t('camera.discardScanMessage'),
        [
          { text: t('alerts.butoane.anuleaza'), style: 'cancel' },
          {
            text: t('camera.discardScanAction'),
            style: 'destructive',
            onPress: () => {
              anuleazaScanarea();
              permitereNavigareRef.current = true;
              navigation.dispatch(e.data.action);
            },
          },
        ],
        { cancelable: true }
      );
    });
    return unsubscribe;
  }, [navigation, rezultat.length, seIncarca, anuleazaScanarea, lasaAnalizaInFundal, t]);

  const trimiteCorectieText = async (textCorectie: string) => {
    try {
      if (__DEV__) console.log('[Camera] Trimit corecție utilizator către backend.');
      
      const response = await fetch(`${API_URL}${API_PREFIX}/corecteaza-mancare-vizual-text`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        // Backend-ul are nevoie exact de acești parametri
        body: JSON.stringify({ 
          current_ingredients: ingredienteIdentificate, 
          user_prompt: textCorectie,
          limba: i18n.language || 'ro'
        })
      });

      // 1. Citim răspunsul serverului INDIFERENT dacă a crăpat sau nu, ca să vedem mesajul real
      const data = await response.json(); 
      if (__DEV__) console.log('[Camera] Răspuns corecție backend primit.');

      // Răspunsurile backend rămân diagnostic intern. Nu afișăm `eroare` brută:
      // poate fi în altă limbă sau poate conține detalii operaționale.
      if (!response.ok) {
         throw new Error('CAMERA_CORRECTION_FAILED');
      }

      // 3. Dacă e totul în regulă, actualizăm datele pe ecran
      if (data.ingredients) {
        setIngredienteIdentificate(normalizePhotoResultItems(data.ingredients));
      }
    } catch (error) {
      // Afisam eroarea si pentru utilizator
      console.error('❌ Eroare fallback detaliată:', error);
      Alert.alert(
        t('alerts.titluri.eroareConexiune'),
        t('alerts.mesaje.serverCorectieInaccesibil'),
      );
    }
  };
  const sendCorrectionToAI = trimiteCorectieText;

  const quality = useMemo(
    () => evaluatePhotoMealQuality(normalizePhotoResultItems(rezultat)),
    [rezultat],
  );
  const totalCalculat = useMemo(() => ({
    calorii: quality.totals.kcal,
    proteine: quality.totals.protein,
    grasimi: quality.totals.fat,
    carbohidrati: quality.totals.carbs,
    fibre: quality.totals.fiber,
  }), [quality.totals]);

  const analizeazaFoto = async () => {
    if (!cameraRef.current || seIncarca || !session) return;
    try {
      const foto = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: false,
        shutterSound: false,
        skipProcessing: Platform.OS === 'android'
      });
      if (foto && foto.uri) {
        analizeazaImaginea(foto.uri);
      }
    } catch (e) {
      console.error("Eroare captură foto:", e);
      // CAM-005: captura eșuată nu rămâne mută — mesaj vizibil + stare curățată.
      setSeIncarca(false);
      setScanError(t('camera.genericScanError'));
    }
  };

  const alegeDinGalerie = async () => {
    if (seIncarca || !session) return;
    try {
      if (Platform.OS === 'ios') {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissionResult.granted) {
          Alert.alert(t('alerts.titluri.permisiuneNecesara'), t('alerts.mesaje.permisiuneGaleriePoze'));
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        analizeazaImaginea(result.assets[0].uri);
      }
    } catch (e) {
      console.error("Eroare galerie:", e);
      Alert.alert(t('alerts.titluri.eroare'), t('alerts.mesaje.galerieInaccesibila'));
    }
  };

  const adaugaInJurnal = async () => {
    if (!rezultat || rezultat.length === 0 || !session || isSavingDiary) return;

    if (quality.requiresReview) {
      Alert.alert(t('camera.reviewRequiredTitle'), t('camera.reviewRequiredMessage'));
      return;
    }

    // Validare gramaj minim înainte de submit
    const invalide = rezultat.filter((r) => !r.estimare_grame || r.estimare_grame < 1);
    if (invalide.length > 0) {
      Alert.alert(
        t('alerts.titluri.gramajLipsa'),
        t('alerts.mesaje.completeazaGramajul', { lista: invalide.map((i) => i.nume).join(', ') })
      );
      return;
    }

    setIsSavingDiary(true);
    const now = new Date();

    // FIX 2.5 + BUG-019: per-100g → valori absolute, normalizate și clampate la
    // limitele CHECK-urilor din Postgres (calorii ≤10000, proteine/grasimi ≤1000,
    // carbohidrati ≤2000, fibre ≤500). Id-ul UUID e determinist din conținutul
    // scanului: reluarea aceleiași salvări (dublu-tap, retry) se ciocnește pe PK
    // 23505 și e tratată ca „deja adăugată", nu ca rând duplicat.
    // P1-01: identitatea acțiunii „Adaugă în jurnal". Este DISTINCTĂ de identitatea
    // operației de analiză AI (P1-12): reluarea analizei nu salvează nimic, iar
    // reluarea salvării nu reapelează furnizorul. Se generează o dată per acțiune
    // și se refolosește la retry / trecere în coada offline.
    if (!idOperatieSalvareRef.current) idOperatieSalvareRef.current = idOperatieNoua();
    const payloadInitial = construiestePayloadMasaCamera({
      idOperatie: idOperatieSalvareRef.current,
      user_id: session.user.id,
      rezultat,
      now,
      poza: { url: imageKitUrlRef.current, fileId: imageKitFileIdRef.current },
    }).payload;
    // REMED-009: tipul mesei = alegerea utilizatorului din chip-uri (implicit
    // sugestia după oră). Introducem prin insereazaMasaCuPoza ca poza plus
    // fallback-ul la scheme vechi (fără imagine_url) să fie reutilizate.
    const payload = { ...payloadInitial, tip_masa: tipMasaSelectat };

    try {
      const { error } = await insereazaMasaCuPoza(supabase, payload);

      if (error) {
        if (esteEroareDuplicate(error)) {
          // P1-01 (Blocant 1): 23505 dovedește doar că EXISTĂ un rând cu acest id,
          // nu că este aceeași salvare. Citim rândul persistat și îl comparăm
          // înainte de a confirma ceva utilizatorului.
          const verificare = await verificaReluareMasa(supabase as never, payload as never);
          if (verificare.tip === 'conflict_continut') {
            Alert.alert(
              t('alerts.titluri.eroareSalvare'),
              t('alerts.mesaje.conflictOperatieMasa'),
            );
            idOperatieSalvareRef.current = null;
            return;
          }
          if (verificare.tip === 'necunoscut') {
            Alert.alert(
              t('alerts.titluri.eroareSalvare'),
              t('alerts.mesaje.problemaNecunoscutaConectare'),
            );
            return;
          }
          // Reluare confirmată: rândul persistat chiar corespunde acestei salvări.
          idOperatieSalvareRef.current = null;
          if (currentPhotoJobIdRef.current) {
            await clearActivePhotoJob(session.user.id, currentPhotoJobIdRef.current).catch(() => {});
            currentPhotoJobIdRef.current = null;
          }
          marcheazaMeseModificate(session.user.id); // P1-04: date canonice noi
          setSaveSuccessData({
            nume: payload.nume || (rezultat.length === 1 ? rezultat[0].nume : `${rezultat.length} alimente`),
            calorii: Math.round(totalCalculat.calorii),
            proteine: Math.round(totalCalculat.proteine * 10) / 10,
            carbohidrati: Math.round(totalCalculat.carbohidrati * 10) / 10,
            grasimi: Math.round(totalCalculat.grasimi * 10) / 10,
            tip_masa: tipMasaSelectat,
            isOffline: false,
          });
          return;
        }
        throw error;
      }

      // P1-01: scriere confirmată — acțiunea logică s-a încheiat. O salvare
      // ulterioară pornește o operație nouă, deci poate crea un rând nou.
      idOperatieSalvareRef.current = null;
      if (currentPhotoJobIdRef.current) {
        await clearActivePhotoJob(session.user.id, currentPhotoJobIdRef.current).catch(() => {});
        currentPhotoJobIdRef.current = null;
      }
      // P1-04: persistare dovedită → invalidare deterministă a datelor canonice.
      marcheazaMeseModificate(session.user.id);

      setSaveSuccessData({
        nume: payload.nume || (rezultat.length === 1 ? rezultat[0].nume : `${rezultat.length} alimente`),
        calorii: Math.round(totalCalculat.calorii),
        proteine: Math.round(totalCalculat.proteine * 10) / 10,
        carbohidrati: Math.round(totalCalculat.carbohidrati * 10) / 10,
        grasimi: Math.round(totalCalculat.grasimi * 10) / 10,
        tip_masa: tipMasaSelectat,
        isOffline: false,
      });
    } catch (e: unknown) {
      console.error('[adaugaInJurnal]', e);
      const clasificare = clasificaRezultatInsertMasa(
        e instanceof Error ? e : { error: e },
      );

      // Erorile structurate ale serverului (RLS, CHECK, validare) și erorile
      // locale de programare NU sunt dovezi de offline. Punerea lor în coadă ar
      // afișa un succes fals și ar relua la nesfârșit o scriere pe care serverul
      // o va refuza determinist. Doar transportul verificat intră în coadă.
      if (clasificare.tip !== 'offline') {
        idOperatieSalvareRef.current = null;
        const mesaj = clasificare.tip === 'eroare_server'
          ? clasificare.mesaj
          : t('alerts.mesaje.eroareNecunoscutaSalvareMasa');
        Alert.alert(
          t('alerts.titluri.eroareSalvare'),
          t('alerts.mesaje.bazaDateRefuza', { eroare: mesaj }),
        );
        return;
      }

      const mesajEroare = clasificare.motiv;
      // U-04: salvare în coada offline FIFO pe eroare de conexiune/rețea
      try {
        const payloadOffline: MasaOfflinePayload = {
          ...payload,
          created_at: now.toISOString(),
        };
        // F-11: nu confirmam „Salvat offline" decat daca masa a ajuns cu adevarat
        // pe disc. Fara verificare, o scriere esuata (storage plin, SQLite ocupat)
        // lasa masa doar in memorie, iar ea dispare la inchiderea aplicatiei —
        // dupa ce utilizatorului i s-a spus ca e in siguranta.
        const { persistat } = await pushOfflineMealVerificat(payloadOffline);
        if (!persistat) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert(t('alerts.titluri.eroareSalvare'), t('offline.masaNesalvataOffline'));
          return;
        }
        if (currentPhotoJobIdRef.current) {
          await clearActivePhotoJob(session.user.id, currentPhotoJobIdRef.current).catch(() => {});
          currentPhotoJobIdRef.current = null;
        }
        setSaveSuccessData({
          nume: payload.nume || (rezultat.length === 1 ? rezultat[0].nume : `${rezultat.length} alimente`),
          calorii: Math.round(totalCalculat.calorii),
          proteine: Math.round(totalCalculat.proteine * 10) / 10,
          carbohidrati: Math.round(totalCalculat.carbohidrati * 10) / 10,
          grasimi: Math.round(totalCalculat.grasimi * 10) / 10,
          tip_masa: tipMasaSelectat,
          isOffline: true,
        });
      } catch {
        Alert.alert(t('alerts.titluri.eroareSalvare'), mesajEroare || t('alerts.mesaje.eroareNecunoscutaSalvareMasa'));
      }
    } finally {
      setIsSavingDiary(false);
    }
  };



  if (!permission) {
    // BUG-059: ecran cu spinner în loc de View gol — fără flash alb/negru pe
    // starea inițială (permission nu e încă încărcat).
    return (
      <View style={[styles.permissionContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: colors.background }]}>
        <View style={styles.permissionContent}>
          <Animated.View entering={reduceMotion ? undefined : ZoomIn.duration(600)} style={[styles.permissionIcon, { shadowColor: colors.accent }]}>
            <LinearGradient colors={colors.accentGradient} style={styles.permissionIconGrad}>
              <Scan size={44} color={colors.background} strokeWidth={2.5} />
            </LinearGradient>
          </Animated.View>
          <Text maxFontSizeMultiplier={1.3} style={[styles.permissionTitle, { color: colors.textPrimary }]}>{t('camera.permissionTitle')}</Text>
          <Text maxFontSizeMultiplier={1.3} style={[styles.permissionSub, { color: colors.textSecondary }]}>{t('camera.permissionSubtitle')}</Text>
          
          {/* BUG-059: când permisiunea e refuzată DEFINITIV (canAskAgain=false pe
              Android), butonul de cerere nu mai face nimic — dead-end. În loc de
              asta ghidăm utilizatorul către setările aplicației. */}
          {permission.canAskAgain === false ? (
            <>
              <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(600).delay(200)} style={[styles.permissionBtn, { shadowColor: colors.accent }]}>
                <TouchableOpacity onPress={() => Linking.openSettings()} accessibilityRole="button" accessibilityLabel={t('camera.openSettings')} accessibilityHint={t('camera.permissionDeniedPermanent')}>
                  <LinearGradient colors={colors.accentGradient} style={styles.permissionBtnGrad}>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.permissionBtnText, { color: colors.background }]}>{t('camera.openSettings')}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
              <Text maxFontSizeMultiplier={1.3} style={[styles.permissionDeniedText, { color: colors.textSecondary }]}>
                {t('camera.permissionDeniedPermanent')}
              </Text>
            </>
          ) : (
            <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(600).delay(200)} style={[styles.permissionBtn, { shadowColor: colors.accent }]}>
              <TouchableOpacity onPress={requestPermission} accessibilityRole="button" accessibilityLabel={t('camera.allowAccess')}>
                <LinearGradient colors={colors.accentGradient} style={styles.permissionBtnGrad}>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.permissionBtnText, { color: colors.background }]}>{t('camera.allowAccess')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}

          <TouchableOpacity style={styles.cancelLink} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} accessibilityRole="button" accessibilityLabel={t('camera.back')} hitSlop={12}>
            <Text style={[styles.cancelLinkText, { color: colors.textSecondary }]}>{t('camera.back')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topHeader, { top: insets.top + 10, left: Math.max(20, insets.left), right: Math.max(20, insets.right) }]}>
        {/* Furnizorul nu este selectat de client: backendul/Trigger păstrează
            Gemini ca autoritate Photo AI și aplică retry-ul bounded. */}
        <View style={styles.aiSelectorContainer}>
          <View
            style={[styles.topBadge, { backgroundColor: 'transparent', borderWidth: 0, zIndex: 9999 }]}
            accessibilityRole="text"
            accessibilityLabel={t('camera.smartAI')}
          >
            <View style={[styles.topBadgeBlur, { paddingVertical: 8 }]}>
              <Zap size={14} color={colors.accent} fill={colors.accent} />
              <Text maxFontSizeMultiplier={1.3} style={[styles.topBadgeText, { color: colors.textPrimary }]}>
                {t('camera.smartAI')}
              </Text>
            </View>
          </View>
        </View>

        {/* Credite + Buton X în Dreapta */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <FlowCreditsPill />
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              permitereNavigareRef.current = true;
              if (!lasaAnalizaInFundal()) anuleazaScanarea();
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)');
            }}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            accessibilityHint={t('camera.discardScanAction')}
          >
            <Text style={styles.closeButtonText}>X</Text>
          </TouchableOpacity>
        </View>
      </View>
      {/* CAM-002: pauză cameră în timpul flow-urilor post-captură (foaia de
          rezultat și modalul de succes) — nu mai ținem senzorul activ în spatele
          overlay-ului. Reluarea vine din anuleazaScanarea (rezultat → gol). */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing="back"
        active={rezultat.length === 0}
      >
        <LinearGradient
          colors={['rgba(5,8,13,0.85)', 'rgba(5,8,13,0)', 'rgba(5,8,13,0.95)']}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* Box Scanare */}
        <View style={styles.scanArea}>
          <View style={[styles.scanBox, { width: scanBoxSize, height: scanBoxSize, borderColor: colors.cardBorder }]}>
            <View style={[styles.corner, styles.cornerTL, { borderColor: colors.accent }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: colors.accent }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: colors.accent }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: colors.accent }]} />

            {seIncarca && (
              <Animated.View entering={FadeIn.duration(300)} style={styles.scanningOverlay} accessibilityLiveRegion="polite">
                <BlurView intensity={60} tint="dark" style={styles.scanningBlur}>
                  <ActivityIndicator size="large" color={colors.accent} />
                  <Animated.Text key={`${photoPhase}-${scanStepIndex}`} entering={FadeInUp.duration(250)} style={[styles.scanningText, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>
                    {photoPhase === 'retrying'
                      ? t('photoJob.retrying')
                      : photoPhase === 'background'
                        ? t('photoJob.backgroundTitle')
                        : scanSteps[scanStepIndex]}
                  </Animated.Text>
                  <View style={styles.stepProgressDots}>
                    {scanSteps.map((_: string, idx: number) => (
                      <View
                        key={idx}
                        style={[
                          styles.stepDot,
                          { backgroundColor: idx <= scanStepIndex ? colors.accent : 'rgba(255,255,255,0.2)' }
                        ]}
                      />
                    ))}
                  </View>

                </BlurView>
              </Animated.View>
            )}

          </View>
          <Text style={styles.scanHint}>{t('camera.scanHint')}</Text>
        </View>
      </CameraView>

      {failedPhotoJob ? (
        <View testID="camera-failed-job" style={[styles.jobStateCard, { top: insets.top + 92, borderColor: colors.danger + '88' }]} accessibilityRole="alert">
          <AlertTriangle size={22} color={colors.danger} />
          <View style={styles.jobStateCopy}>
            <Text style={[styles.jobStateTitle, { color: colors.textPrimary }]}>{t('photoJob.failedTitle')}</Text>
            <Text style={[styles.jobStateBody, { color: colors.textSecondary }]}>{t('photoJob.failedBody')}</Text>
          </View>
          <Pressable
            testID="camera-failed-retry"
            onPress={() => void retryFailedPhotoJob()}
            style={[styles.jobStateAction, { borderColor: colors.danger + '88' }]}
            accessibilityRole="button"
            accessibilityLabel={t('photoJob.retry')}
          >
            <Text style={[styles.jobStateActionText, { color: colors.danger }]}>{t('photoJob.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {photoPhase === 'background' && !seIncarca && !failedPhotoJob ? (
        <Pressable
          testID="camera-background-job"
          onPress={() => router.replace('/(tabs)')}
          style={[styles.jobStateCard, { top: insets.top + 92, borderColor: colors.accentSecondary + '88' }]}
          accessibilityRole="button"
          accessibilityLabel={t('photoJob.viewStatus')}
        >
          <ActivityIndicator color={colors.accentSecondary} />
          <View style={styles.jobStateCopy}>
            <Text style={[styles.jobStateTitle, { color: colors.textPrimary }]}>{t('photoJob.backgroundTitle')}</Text>
            <Text style={[styles.jobStateBody, { color: colors.textSecondary }]}>{t('photoJob.backgroundBody')}</Text>
          </View>
        </Pressable>
      ) : null}

      {/* Result section & sheet */}
      {rezultat.length > 0 && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View entering={FadeInUp.duration(500).springify()} style={[styles.resultSheet, { borderColor: colors.accent + '26' }]}>
            <BlurView intensity={65} tint="dark" style={[styles.resultBlur, { maxHeight: Math.round(height * 0.88) }]}>
              <LinearGradient colors={[colors.accent + '14', 'rgba(10,14,20,0.98)']} style={styles.resultGrad}>
                <View style={styles.resultHandle} />
                
                <ScrollView
                  testID="camera-result-scroll"
                  style={styles.resultScrollView}
                  contentContainerStyle={[
                    styles.resultScrollContent,
                    { paddingBottom: Math.max(insets.bottom, 16) + 36 }
                  ]}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.resultHeading}>
                    <View style={styles.resultHeadingText}>
                      <Text maxFontSizeMultiplier={1.3} style={[styles.resultEyebrow, { color: colors.accent }]}>
                        {t('camera.detectedMeal')}
                      </Text>
                      <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={[styles.resultTitle, { color: colors.textPrimary }]}>
                        {rezultat.map((item) => item.nume).join(', ')}
                      </Text>
                    </View>
                    <Pressable
                      testID="camera-meal-correction-toggle"
                      onPress={() => setMealCorrectionOpen((open) => !open)}
                      style={[styles.mealSuggestionChip, { borderColor: colors.accent + '55' }]}
                      accessibilityRole="button"
                      accessibilityLabel={t('camera.changeMealCategory')}
                      accessibilityState={{ expanded: mealCorrectionOpen }}
                    >
                      <FlowIcon name={CATEGORIE_ICONA[tipMasaSelectat]} size={14} color={colors.accent} />
                      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.mealSuggestionText, { color: colors.accent }]}>
                        {t(`chat.mealCategory.${tipMasaSelectat}`)}
                      </Text>
                      <ChevronDown size={14} color={colors.accent} />
                    </Pressable>
                  </View>

                  {mealCorrectionOpen ? (
                    <View style={styles.mealTypeRow} accessibilityRole="radiogroup" accessibilityLabel={t('camera.mealCategoryLabel')}>
                      {MEAL_CATEGORIES.map((cat) => {
                        const selected = tipMasaSelectat === cat.id;
                        return (
                          <Pressable
                            key={cat.id}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setTipMasaSelectat(cat.id);
                              setMealCorrectionOpen(false);
                            }}
                            style={[styles.mealTypeChip, selected && { borderColor: colors.accent, backgroundColor: colors.accent + '22' }]}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: selected }}
                            accessibilityLabel={t(`chat.mealCategory.${cat.id}`)}
                          >
                            <FlowIcon name={CATEGORIE_ICONA[cat.id]} size={14} color={selected ? colors.accent : colors.textSecondary} />
                            <Text maxFontSizeMultiplier={1.3} style={[styles.mealTypeChipText, { color: selected ? colors.accent : colors.textSecondary }]}>
                              {t(`chat.mealCategory.${cat.id}`)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}

                  {/* Rezumat macro & calorii */}
                  <View style={styles.macroRow} testID="camera-macro-summary">
                    <View style={styles.macroItem}>
                      <Text maxFontSizeMultiplier={1.3} style={[styles.macroValue, { color: colors.accent }]}>{Math.round(totalCalculat.calorii)}</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[styles.macroLabel, { color: colors.textSecondary }]}>kcal</Text>
                    </View>
                    <View style={styles.macroDivider} />
                    <View style={styles.macroItem}>
                      <Text maxFontSizeMultiplier={1.3} style={[styles.macroValue, { color: colors.accentSecondary }]}>{Math.round(totalCalculat.proteine)}g</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[styles.macroLabel, { color: colors.textSecondary }]}>{t('jurnal.macroProtein')}</Text>
                    </View>
                    <View style={styles.macroDivider} />
                    <View style={styles.macroItem}>
                      <Text maxFontSizeMultiplier={1.3} style={[styles.macroValue, { color: colors.accentTertiary }]}>{Math.round(totalCalculat.carbohidrati)}g</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[styles.macroLabel, { color: colors.textSecondary }]}>{t('jurnal.macroCarbs')}</Text>
                    </View>
                    <View style={styles.macroDivider} />
                    <View style={styles.macroItem}>
                      <Text maxFontSizeMultiplier={1.3} style={[styles.macroValue, { color: colors.warning }]}>{Math.round(totalCalculat.grasimi)}g</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[styles.macroLabel, { color: colors.textSecondary }]}>{t('jurnal.macroFats')}</Text>
                    </View>
                    <View style={styles.macroDivider} />
                    <View style={styles.macroItem}>
                      <Text maxFontSizeMultiplier={1.3} style={[styles.macroValue, { color: colors.textPrimary }]}>
                        {totalCalculat.fibre === null ? '—' : `${Math.round(totalCalculat.fibre)}g`}
                      </Text>
                      <Text maxFontSizeMultiplier={1.3} style={[styles.macroLabel, { color: colors.textSecondary }]}>{t('camera.fiber')}</Text>
                    </View>
                  </View>

                  {quality.requiresReview ? (
                    <View testID="camera-quality-warning" style={[styles.qualityWarning, { borderColor: colors.warning + '66' }]} accessibilityRole="alert">
                      <AlertTriangle size={18} color={colors.warning} />
                      <View style={styles.qualityWarningTextWrap}>
                        <Text maxFontSizeMultiplier={1.3} style={[styles.qualityWarningTitle, { color: colors.warning }]}>{t('camera.reviewRequiredTitle')}</Text>
                        <Text maxFontSizeMultiplier={1.3} style={[styles.qualityWarningBody, { color: colors.textSecondary }]}>{t('camera.reviewRequiredMessage')}</Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Rânduri ingrediente identificate */}
                  <Text maxFontSizeMultiplier={1.3} style={[styles.ingredientsTitle, { color: colors.textPrimary }]}>{t('camera.detectedIngredients')}</Text>
                  <View style={styles.ingredientsList}>
                    {rezultat.map((ingredient, index) => {
                      const kcalRand = Math.round(
                        ((ingredient.calorii_per_100g || 0) * (ingredient.estimare_grame || 0)) / 100,
                      );
                      return (
                        <View key={`${ingredient.nume}-${index}`} style={styles.ingredientRow}>
                          <View style={styles.ingredientMain}>
                            <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={[styles.ingredientName, { color: colors.textPrimary }]}>
                              {ingredient.nume || t('camera.unidentifiedFoodDefault')}
                            </Text>
                            <Text maxFontSizeMultiplier={1.3} style={[styles.ingredientNutrition, { color: colors.textSecondary }]}>
                              {kcalRand} kcal · {Math.round(ingredient.proteine_per_100g * ingredient.estimare_grame / 10) / 10}g {t('camera.proteinShort')} · {Math.round(ingredient.carbohidrati_per_100g * ingredient.estimare_grame / 10) / 10}g {t('camera.carbsShort')}
                            </Text>
                          </View>
                          <View style={[styles.gramContainer, { borderColor: colors.accent + '33' }]}>
                            <GramInput
                              value={ingredient.estimare_grame}
                              onChange={(g) => updateIngredient(index, { estimare_grame: g })}
                              borderColor="transparent"
                              color={colors.accent}
                            />
                          </View>
                          <Pressable
                            onPress={() => stergeIngredient(index)}
                            hitSlop={10}
                            style={styles.deleteIngredientBtn}
                            accessibilityRole="button"
                            accessibilityLabel={t('jurnal.deleteIngredient', { nume: ingredient.nume })}
                            accessibilityHint={t('camera.deleteIngredientHint')}
                          >
                            <Trash2 size={16} color={colors.danger} />
                          </Pressable>
                        </View>
                      );
                    })}

                    <View style={{ marginTop: 12 }}>
                      <IngredientCorrectionInput
                        ingredienteCurente={rezultat}
                        onCorectat={setRezultat}
                        onSend={sendCorrectionToAI}
                      />
                    </View>
                  </View>

                  {/* Butoane acțiune Jurnal */}
                  <View style={styles.actionButtonsArea}>
                    <TouchableOpacity
                      testID="camera-add-journal-btn"
                      style={[styles.addBtn, { shadowColor: colors.accent, opacity: quality.requiresReview ? 0.45 : 1 }]}
                      onPress={adaugaInJurnal}
                      disabled={quality.requiresReview || isSavingDiary}
                      accessibilityRole="button"
                      accessibilityLabel={t('camera.addToJournal')}
                      accessibilityState={{ disabled: quality.requiresReview || isSavingDiary, busy: isSavingDiary }}
                    >
                      <LinearGradient colors={colors.accentGradient} style={styles.addBtnGrad}>
                        <Text maxFontSizeMultiplier={1.3} style={[styles.addBtnText, { color: colors.background }]}>{t('camera.addToJournal')}</Text>
                      </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                      testID="camera-retry-btn"
                      style={styles.retryBtn}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); anuleazaScanarea(); }}
                      accessibilityRole="button"
                      accessibilityLabel={t('camera.cancelAndRescan')}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <FlowIcon name="refresh" size={16} color={colors.accent} />
                        <Text maxFontSizeMultiplier={1.3} style={styles.retryBtnText}>{t('camera.cancelAndRescan')}</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </LinearGradient>
            </BlurView>
          </Animated.View>
        </KeyboardAvoidingView>
      )}

      {scanError && (
        <View style={[styles.errorCard, { top: insets.top + 78 }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <Text maxFontSizeMultiplier={1.3} style={styles.errorText}>{scanError}</Text>
          <Pressable onPress={() => setScanError(null)} accessibilityRole="button" accessibilityLabel={t('camera.closeErrorA11y')}>
            <Text maxFontSizeMultiplier={1.3} style={styles.retryText}>{t('common.close')}</Text>
          </Pressable>
        </View>
      )}

      {isSavingDiary && (
        <View style={styles.savingOverlay} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={colors.accent} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.savingText, { color: colors.accent }]}>{t('camera.savingToJournal')}</Text>
        </View>
      )}

      {/* Shutter & Gallery button */}
      {rezultat.length === 0 && (
        <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(600).delay(200)} style={[styles.shutterArea, { bottom: Math.max(insets.bottom, 16) + 20 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 28 }}>
            <TouchableOpacity
              testID="gallery-button"
              accessibilityRole="button"
              accessibilityLabel={t('camera.galleryButton')}
              accessibilityHint={t('camera.galleryHint')}
              accessibilityState={{ disabled: seIncarca, busy: seIncarca }}
              style={[styles.galleryBtn, { borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(0,0,0,0.5)' }]}
              onPress={alegeDinGalerie}
              disabled={seIncarca}
            >
              <ImageIcon size={22} color="#FFFFFF" />
              <Text maxFontSizeMultiplier={1.3} style={styles.galleryBtnText}>{t('camera.galleryLabel')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="shutter-button"
              accessibilityRole="button"
              accessibilityLabel={t('camera.shutterButton')}
              accessibilityHint={t('camera.shutterHint')}
              accessibilityState={{ disabled: seIncarca, busy: seIncarca }}
              style={[styles.shutterBtn, { shadowColor: colors.accent, borderColor: colors.accent + '4D' }]}
              onPress={analizeazaFoto}
              disabled={seIncarca}
            >
              <LinearGradient
                colors={seIncarca ? ['#333', '#222'] : colors.accentGradient}
                style={styles.shutterGrad}
              >
                {seIncarca
                  ? <ActivityIndicator color={colors.background} />
                  : <Scan size={32} color={colors.background} strokeWidth={2.5} />
                }
              </LinearGradient>
            </TouchableOpacity>

            <View style={{ width: 72 }} />
          </View>
          <Text maxFontSizeMultiplier={1.3} style={styles.shutterLabel}>{t('camera.shutterLabel')}</Text>
        </Animated.View>
      )}

      <MealSaveSuccessModal
        visible={!!saveSuccessData}
        data={saveSuccessData}
        onDismiss={handleSaveSuccessDismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  permissionContent: { alignItems: 'center', padding: 32 },
  permissionIcon: { marginBottom: 32, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 20 },
  permissionIconGrad: { width: 96, height: 96, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  permissionTitle: { fontSize: 36, fontWeight: '900', letterSpacing: -1, marginBottom: 12 },
  permissionSub: { fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 40, maxWidth: '85%' },
  permissionDeniedText: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 16, maxWidth: '90%' },
  permissionBtn: { width: '100%', borderRadius: 20, overflow: 'hidden', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10 },
  permissionBtnGrad: { padding: 20, alignItems: 'center' },
  permissionBtnText: { fontSize: 18, fontWeight: '900' },
  cancelLink: { marginTop: 24, padding: 12 },
  cancelLinkText: { fontSize: 16, fontWeight: '600' },

  topHeader: {
    position: 'absolute',
    // top: suprascris inline cu insets.top + 10
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 9999,
  },
  aiSelectorContainer: {
    // Asigură-te că AiSelector are fundal opac
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 20,
    paddingHorizontal: 10,
  },
  closeButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    // BUG-030: țintă de atingere minimă 44×44 (era 40×40).
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },

  topBar: { position: 'absolute', top: 60, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24 },
  closeBtn: { borderRadius: 20, overflow: 'hidden' },
  closeBtnBlur: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  topBadge: { borderRadius: 20, overflow: 'hidden', borderWidth: 1 },
  topBadgeBlur: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  topBadgeText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginLeft: 6 },

  scanArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanBox: {
    borderRadius: 24,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  corner: { position: 'absolute', width: 36, height: 36, borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 16 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 16 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 16 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 16 },
  scanningOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 24, overflow: 'hidden' },
  scanningBlur: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  scanningText: { fontWeight: '700', fontSize: 15, marginTop: 16, textAlign: 'center' },
  stepProgressDots: { flexDirection: 'row', gap: 6, marginTop: 14, alignItems: 'center' },
  stepDot: { width: 8, height: 8, borderRadius: 4 },

  scanHint: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '500', marginTop: 24, letterSpacing: 0.5 },

  resultSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 36, borderTopRightRadius: 36, overflow: 'hidden', borderWidth: 1 },
  resultBlur: { overflow: 'hidden' },
  resultGrad: { paddingTop: 16, paddingHorizontal: 18 },
  resultHandle: { width: 44, height: 5, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
  resultScrollView: { width: '100%' },
  resultScrollContent: { width: '100%', paddingHorizontal: 4 },
  resultHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  resultHeadingText: { flex: 1, minWidth: 0 },
  resultEyebrow: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  resultTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, lineHeight: 25 },
  mealSuggestionChip: { minHeight: 40, maxWidth: '48%', flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 },
  mealSuggestionText: { flexShrink: 1, fontSize: 12, fontWeight: '800' },

  ingredientsList: { width: '100%', marginBottom: 16 },
  ingredientsTitle: { fontSize: 15, fontWeight: '800', marginBottom: 9 },
  ingredientRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  ingredientMain: { flex: 1, minWidth: 150 },
  ingredientName: { fontSize: 16, fontWeight: '700', paddingVertical: 2 },
  ingredientNutrition: { fontSize: 12, fontWeight: '600', lineHeight: 18, marginTop: 2 },
  mealTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  mealTypeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    minHeight: 44,
    paddingHorizontal: 12, paddingVertical: 12,
    borderRadius: 999, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  mealTypeChipText: { fontSize: FontSize.caption, fontWeight: '700' },
  gramContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1 },
  deleteIngredientBtn: { padding: 6, marginLeft: 6, alignItems: 'center', justifyContent: 'center' },
  gramInput: { fontSize: 16, fontWeight: '800', paddingVertical: 8, minWidth: 40, textAlign: 'center' },
  gramUnit: { fontSize: 14, fontWeight: '600', marginLeft: 4 },
  macroRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  macroItem: { flexGrow: 1, flexBasis: '30%', alignItems: 'center', minWidth: 72 },
  macroValue: { fontSize: 18, fontWeight: '900', marginBottom: 4 },
  macroLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  macroDivider: { width: 0 },
  qualityWarning: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, backgroundColor: 'rgba(245,158,11,0.08)', marginBottom: 14 },
  qualityWarningTextWrap: { flex: 1 },
  qualityWarningTitle: { fontSize: 13, fontWeight: '800', marginBottom: 3 },
  qualityWarningBody: { fontSize: 12, lineHeight: 17 },
  actionButtonsArea: { width: '100%', marginTop: 8 },
  addBtn: { borderRadius: 20, overflow: 'hidden', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 10 },
  addBtnGrad: { padding: 18, alignItems: 'center' },
  addBtnText: { fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  retryBtn: { padding: 14, alignItems: 'center', marginTop: 10, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.08)' },
  retryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  errorCard: { position: 'absolute', top: 120, left: 20, right: 20, backgroundColor: 'rgba(239,68,68,0.9)', padding: 16, borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 999 },
  errorText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14, flex: 1, marginRight: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, textDecorationLine: 'underline' },
  jobStateCard: { position: 'absolute', left: 16, right: 16, zIndex: 1200, minHeight: 86, borderWidth: 1, borderRadius: 18, padding: 13, backgroundColor: 'rgba(8,12,18,0.96)', flexDirection: 'row', alignItems: 'center', gap: 11 },
  jobStateCopy: { flex: 1, minWidth: 0 },
  jobStateTitle: { fontSize: 14, lineHeight: 18, fontWeight: '900' },
  jobStateBody: { marginTop: 2, fontSize: 12, lineHeight: 17 },
  jobStateAction: { minHeight: 44, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  jobStateActionText: { fontSize: 12, fontWeight: '900' },

  savingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,8,13,0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 2000 },
  savingText: { fontSize: 18, fontWeight: '800', marginTop: 16 },

  shutterArea: { position: 'absolute', bottom: 60, left: 0, right: 0, alignItems: 'center' },
  shutterBtn: { width: 80, height: 80, borderRadius: 40, overflow: 'hidden', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.6, shadowRadius: 24, elevation: 20, borderWidth: 3 },
  shutterGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  shutterLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', marginTop: 16, letterSpacing: 0.5 },
  galleryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 20, borderWidth: 1 },
  galleryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  aiDropdownMenu: { position: 'absolute', top: 100, left: 24, right: 24, zIndex: 10000, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 15 },
  aiDropdownBlur: { padding: 18, backgroundColor: 'rgba(15, 23, 42, 0.88)' },
  aiDropdownHeader: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.45)', letterSpacing: 1.2, marginBottom: 12 },
  aiDropdownItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: 'transparent' },
  aiDropdownTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  aiDropdownDesc: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  statusIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
});
