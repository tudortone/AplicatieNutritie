
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator, Pressable, Text, View, StyleSheet, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, Linking,
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
import Animated, { FadeIn, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { Scan, Zap, Image as ImageIcon, AlertTriangle, Home, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { getTipMasaDupaOra, insereazaMasaCuPoza, normalizeTipMasa } from '../lib/mealUtils';
import { clasificaRezultatInsertMasa, construiestePayloadMasaCamera, esteEroareDuplicate, raspunsInsertMasaConfirmat, verificaReluareMasa } from '../lib/payloadMese';
import { idOperatieNoua } from '@/lib/idUtils';
import { anuntaMasaSalvataVerificat, marcheazaMeseModificate } from '@/lib/freshnessMese';
import { type AlimentScanat } from '@/components/food/FoodScanSuccessModal';
import type { TipMasa } from '../types';
import { FontSize } from '../constants/theme';
import { PhotoMealResultView } from '@/components/food/PhotoMealResultView';
import { PhotoMealErrorView } from '@/components/food/PhotoMealErrorView';
import { uploadImageToImageKit, getImageKitAuthParams } from '@/lib/imagekit';
import { useFlowCredits } from '../context/FlowCreditsContext';
import { FlowCreditsPill } from '@/components/FlowCreditsPill';
import { optimizeImageBeforeUpload, saveLocalImageDraft, discardLocalImageDraft, listPendingDrafts, amprentaOperatieFoto, purgeLocalImageDrafts } from '@/lib/imageOptimizer';
import { pushOfflineMealVerificat, processOfflineQueue, MasaOfflinePayload } from '@/lib/offlineQueue';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { MealSaveSuccessModal, type MealSuccessData } from '../components/ui/MealSaveSuccessModal';
import {
  clearActivePhotoJob,
  hasPendingPhotoSave,
  recoverPhotoJobForCamera,
  savePhotoJobSaveAttempt,
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

function restorePhotoMealItems(
  items: AlimentScanat[],
  savePayload?: Record<string, unknown> | null,
): AlimentScanat[] {
  const savedItems = savePayload?.alimente;
  if (!Array.isArray(savedItems)) return items;
  return savedItems.map((saved) => {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
      throw new PhotoApiError(500, 'INVALID_PENDING_MEAL_SAVE_DRAFT');
    }
    const record = saved as Record<string, unknown>;
    const grams = Number(record.grame);
    const name = typeof record.nume === 'string' ? record.nume.trim() : '';
    const nutrientFields = ['calorii', 'proteine', 'carbohidrati', 'grasimi', 'fibre'] as const;
    if (!name || !Number.isFinite(grams) || grams <= 0
      || nutrientFields.some((field) => !Number.isFinite(Number(record[field])))) {
      throw new PhotoApiError(500, 'INVALID_PENDING_MEAL_SAVE_DRAFT');
    }
    const per100 = (field: typeof nutrientFields[number]) => Number(record[field]) * 100 / grams;
    return {
      nume: name,
      estimare_grame: grams,
      calorii_per_100g: per100('calorii'),
      proteine_per_100g: per100('proteine'),
      carbohidrati_per_100g: per100('carbohidrati'),
      grasimi_per_100g: per100('grasimi'),
      fibre_per_100g: per100('fibre'),
    };
  });
}

function photoMealDraftMatches(
  current: Record<string, unknown>,
  saved: Record<string, unknown>,
): boolean {
  const fields = ['user_id', 'nume', 'calorii', 'proteine', 'grasimi', 'carbohidrati', 'fibre', 'tip_masa'];
  return fields.every((field) => String(current[field] ?? '') === String(saved[field] ?? ''))
    && JSON.stringify(current.alimente) === JSON.stringify(saved.alimente);
}


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

  const { session } = useAuth();
  const sessionUserId = session?.user?.id ?? null;
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  
  const [rezultat, setRezultat] = useState<AlimentScanat[]>([]);
  const [isSavingDiary, setIsSavingDiary] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [seIncarca, setSeIncarca] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const [pendingPhotoSaveLocked, setPendingPhotoSaveLocked] = useState(false);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const [photoStateOwnerId, setPhotoStateOwnerId] = useState<string | null>(sessionUserId);
  const [photoPhase, setPhotoPhase] = useState<'idle' | 'uploading' | 'processing' | 'background' | 'retrying' | 'completed' | 'failed'>('idle');
  const [failedPhotoJob, setFailedPhotoJob] = useState<{ job: PhotoJob; pointer: ActivePhotoJobPointer } | null>(null);
  const [analysisStage, setAnalysisStage] = useState<1 | 2 | 3 | 4>(1);
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
  // Lock synchronously before the first await; React state alone cannot reject
  // two callbacks dispatched from the same render on rapid Android taps.
  const saveAttemptSequenceRef = useRef(0);
  const activeSaveAttemptRef = useRef<number | null>(null);
  const pendingPhotoSavePayloadRef = useRef<Record<string, unknown> | null>(null);
  const sessionUserIdRef = useRef<string | null>(sessionUserId);
  sessionUserIdRef.current = sessionUserId;
  const photoStateOwnerIdRef = useRef<string | null>(sessionUserId);
  const accountGenerationRef = useRef(0);
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
  const isTakingPhotoRef = useRef(false);
  const shouldGoHomeOnSubmitRef = useRef(false);

  const isPhotoOwnerCurrent = useCallback((userId: string, generation: number) => (
    sessionUserIdRef.current === userId
    && photoStateOwnerIdRef.current === userId
    && accountGenerationRef.current === generation
  ), []);

  // A camera screen can survive a Supabase Auth change. Clear every transient
  // photo/save reference before exposing the next account's screen, and make
  // every in-flight callback from the prior account stale immediately.
  useEffect(() => {
    if (photoStateOwnerIdRef.current === sessionUserId) return;
    photoStateOwnerIdRef.current = sessionUserId;
    accountGenerationRef.current += 1;
    uploadGenerationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    isTakingPhotoRef.current = false;
    activeSaveAttemptRef.current = null;
    imageKitUrlRef.current = null;
    imageKitFileIdRef.current = null;
    currentPhotoJobIdRef.current = null;
    draftCurrentUriRef.current = null;
    idOperatieSalvareRef.current = null;
    pendingPhotoSavePayloadRef.current = null;
    draftPromptAfisatRef.current = false;
    setPhotoStateOwnerId(sessionUserId);
    setRezultat([]);
    setTipMasaSelectat(getTipMasaDupaOra(new Date()));
    setIsSavingDiary(false);
    setScanError(null);
    setPhotoPhase('idle');
    setFailedPhotoJob(null);
    setAnalysisStage(1);
    setSaveSuccessData(null);
    setRecoveryBlocked(false);
    setPendingPhotoSaveLocked(false);
    setRecoveryChecked(false);
    setSeIncarca(false);
  }, [sessionUserId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Doar dacă NU avem un job activ pe backend sau o trecere cerută la Acasă,
      // anulăm cererea locală. Dacă jobul e deja pornit pe server, el continuă
      // în fundal și va fi semnalizat pe Acasă prin Sfera Runner.
      if (!currentPhotoJobIdRef.current && !shouldGoHomeOnSubmitRef.current) {
        abortControllerRef.current?.abort();
      }
      abortControllerRef.current = null;
    };
  }, []);


  useEffect(() => {
    if (session?.user?.id) {
      processOfflineQueue(supabase).catch(() => {});
      // Prewarm ImageKit auth cache in background so photo capture doesn't wait on auth roundtrip
      getImageKitAuthParams().catch(() => {});
    }
  }, [session?.user?.id]);



  const applyPhotoJobResult = useCallback((
    job: PhotoJob,
    pointer: ActivePhotoJobPointer | null | undefined,
    ownerId: string,
    generation: number,
  ) => {
    if (!isPhotoOwnerCurrent(ownerId, generation) || (pointer && pointer.userId !== ownerId)) return;
    if (!job.result?.success || !Array.isArray(job.result.items)) {
      throw new PhotoApiError(502, 'INVALID_PHOTO_JOB_RESULT');
    }
    const normalized = normalizePhotoResultItems(job.result.items);
    if (normalized.length === 0) throw new PhotoApiError(422, 'PHOTO_RESULT_EMPTY');

    imageKitUrlRef.current = pointer?.imageUrl || job.imageUrl || imageKitUrlRef.current;
    imageKitFileIdRef.current = pointer?.imageFileId || job.imageFileId || imageKitFileIdRef.current;
    currentPhotoJobIdRef.current = job.id;
    idOperatieSalvareRef.current = pointer?.saveOperationId || null;
    pendingPhotoSavePayloadRef.current = pointer?.savePayload || null;
    setPendingPhotoSaveLocked(Boolean(pointer?.savePayload));
    const capturedAt = pointer?.savedAt ? new Date(pointer.savedAt) : new Date();
    setTipMasaSelectat(pointer?.savePayload?.tip_masa
      ? normalizeTipMasa(String(pointer.savePayload.tip_masa))
      : inferCanonicalMealType({ aiMealType: job.result.tipMasa, capturedAt }));
    setRezultat(restorePhotoMealItems(normalized, pointer?.savePayload));
    setPhotoPhase('completed');
    setFailedPhotoJob(null);
  }, [isPhotoOwnerCurrent]);

  const analizeazaImaginea = useCallback(async (imageUri: string, isRetry = false) => {
    if (pendingPhotoSavePayloadRef.current) {
      Alert.alert(
        t('alerts.titluri.eroareSalvare'),
        t('alerts.mesaje.problemaNecunoscutaConectare'),
      );
      return;
    }
    if (!session?.access_token || !session.user.id) {
      setScanError(t('alerts.mesaje.sesiuneExpirata'));
      return;
    }
    const ownerId = session.user.id;
    const accountGeneration = accountGenerationRef.current;
    if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
    let hasPendingSave: boolean;
    try {
      hasPendingSave = await hasPendingPhotoSave(ownerId);
    } catch {
      if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
      Alert.alert(
        t('alerts.titluri.eroareSalvare'),
        t('alerts.mesaje.problemaNecunoscutaConectare'),
      );
      return;
    }
    if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
    if (hasPendingSave) {
      Alert.alert(
        t('alerts.titluri.eroareSalvare'),
        t('alerts.mesaje.problemaNecunoscutaConectare'),
      );
      return;
    }
    abortControllerRef.current?.abort();
    uploadGenerationRef.current += 1;
    const uploadGeneration = uploadGenerationRef.current;
    imageKitUrlRef.current = null;
    imageKitFileIdRef.current = null;
    currentPhotoJobIdRef.current = null;
    idOperatieSalvareRef.current = null;
    pendingPhotoSavePayloadRef.current = null;
    setPendingPhotoSaveLocked(false);
    setFailedPhotoJob(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setScanError(null);
    setRezultat([]);
    setAnalysisStage(1);
    setSeIncarca(true);
    setPhotoPhase(isRetry ? 'retrying' : 'uploading');
    let timeoutDepasit = false;
    let activePointer: ActivePhotoJobPointer | null = null;
    const backgroundId = setTimeout(() => {
      if (!controller.signal.aborted && isPhotoOwnerCurrent(ownerId, accountGeneration)) setPhotoPhase('background');
    }, 15000);
    const timeoutId = setTimeout(() => {
      if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
      timeoutDepasit = true;
      setPhotoPhase('background');
      controller.abort();
    }, 75000);

    try {
      const imagineOptimizata = await optimizeImageBeforeUpload(imageUri);
      if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
      const draftPersistentUri = await saveLocalImageDraft(imagineOptimizata.uri, ownerId);
      if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
      draftCurrentUriRef.current = draftPersistentUri;

      const amprentaBaza = await amprentaOperatieFoto(
        imagineOptimizata.uri,
        'auto',
        i18n.language || 'ro',
      );
      if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
      const amprentaOperatie = isRetry
        ? `${amprentaBaza}:retry:${idOperatieNoua()}`
        : amprentaBaza;

      const uploaded = await uploadImageToImageKit(
        imagineOptimizata.uri,
        'mancare.jpg',
        controller.signal,
        { skipOptimization: true },
      );
      if (controller.signal.aborted || uploadGenerationRef.current !== uploadGeneration
        || !isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
      imageKitUrlRef.current = uploaded.url;
      imageKitFileIdRef.current = uploaded.fileId;
      setAnalysisStage(2);
      setPhotoPhase(isRetry ? 'retrying' : 'processing');

      const submitted = await submitPhotoJob({
        token: session.access_token,
        userId: ownerId,
        imageUrl: uploaded.url,
        imageFileId: uploaded.fileId,
        analysisId: amprentaOperatie,
        mealType: getTipMasaDupaOra(new Date()),
        language: i18n.language || 'ro',
        localImageUri: imagineOptimizata.uri,
        draftUri: draftPersistentUri,
        signal: controller.signal,
      });
      if (controller.signal.aborted || uploadGenerationRef.current !== uploadGeneration
        || !isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
      currentPhotoJobIdRef.current = submitted.id;
      idOperatieSalvareRef.current = null;
      activePointer = {
        userId: ownerId,
        jobId: submitted.id,
        imageUrl: uploaded.url,
        imageFileId: uploaded.fileId,
        localImageUri: imagineOptimizata.uri,
        draftUri: draftPersistentUri,
        savedAt: Date.now(),
      };
      flowCredits.consumeOptimisticCredit();
      if (shouldGoHomeOnSubmitRef.current) {
        if (__DEV__) console.log('[Camera] Job pornit pe backend, utilizatorul a mers la Acasă:', submitted.id);
        setPhotoPhase('background');
        setSeIncarca(false);
        return;
      }
      const completed = await waitForPhotoJob({
        token: session.access_token,
        userId: ownerId,
        jobId: submitted.id,
        signal: controller.signal,
        onStatus: (job: PhotoJob) => {
          if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
          if (job.status === 'queued') setAnalysisStage(2);
          else if (job.status === 'running' || job.status === 'processing') setAnalysisStage(3);
          else if (job.status === 'succeeded' || job.status === 'completed') setAnalysisStage(4);
        },
      });
      if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
      applyPhotoJobResult(completed, activePointer, ownerId, accountGeneration);
      setSeIncarca(false);

      await discardLocalImageDraft(draftPersistentUri, ownerId).catch(() => {});
      if (draftCurrentUriRef.current === draftPersistentUri) draftCurrentUriRef.current = null;

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (isPhotoOwnerCurrent(ownerId, accountGeneration)) void flowCredits.refresh();
    } catch (error) {
      if (isPhotoOwnerCurrent(ownerId, accountGeneration)) void flowCredits.refresh();
      if (abortControllerRef.current !== controller || !isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
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
      const isNonFoodErrorCode = error instanceof PhotoApiError && (
        error.code === 'NOT_FOOD'
        || error.code === 'NO_FOOD'
        || error.code === 'PHOTO_RESULT_EMPTY'
        || error.code === 'EMPTY_RESULT'
        || error.code === 'PHOTO_RESULT_INVALID'
        || error.code === 'PHOTO_ANALYSIS_FAILED'
      );
      if (isNonFoodErrorCode) {
        setPhotoPhase('failed');
        setFailedPhotoJob({
          job: { id: activePointer?.jobId || currentPhotoJobIdRef.current || 'unknown', status: 'failed', errorCode: 'NOT_FOOD' },
          pointer: activePointer || { userId: ownerId, jobId: 'unknown', savedAt: Date.now() },
        });
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
      const friendlyMsg = error instanceof PhotoApiError && (error.code === 'TIMEOUT' || error.status === 504)
        ? t('camera.aiProviderErrorMessage', 'Analiza nu a putut fi finalizată.')
        : error instanceof TypeError && error.message.toLowerCase().includes('network')
          ? t('camera.networkErrorMessage', 'Conexiunea a fost întreruptă.')
          : t('camera.genericScanError', 'Analiza nu a putut fi finalizată.');
      setScanError(friendlyMsg);
    } finally {
      clearTimeout(backgroundId);
      clearTimeout(timeoutId);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        if (isMountedRef.current) setSeIncarca(false);
      }
    }
  }, [applyPhotoJobResult, flowCredits, i18n.language, isPhotoOwnerCurrent, session?.access_token, session?.user?.id, t]);

  // Un job Photo AI este recuperabil după închiderea aplicației. Analiza rămâne
  // în Trigger; acest ecran doar reia polling-ul și reconstruiește review-ul.
  useEffect(() => {
    if (!session?.access_token || !session.user.id) return;
    const controller = new AbortController();
    const token = session.access_token;
    const userId = session.user.id;
    const accountGeneration = accountGenerationRef.current;

    // Pre-warm ImageKit credentials on camera open to eliminate upload cold start
    if (typeof getImageKitAuthParams === 'function') {
      void getImageKitAuthParams(controller.signal).catch(() => {});
    }

    const recover = async () => {
      try {
        const active = await recoverPhotoJobForCamera({ token, userId, signal: controller.signal });
        if (!active || controller.signal.aborted || !isPhotoOwnerCurrent(userId, accountGeneration)) return;
        if (active.missingJob) {
          const pointer = active.pointer;
          const payload = pointer.savePayload;
          if (!payload || pointer.userId !== userId || payload.user_id !== userId
            || !pointer.saveOperationId || typeof payload.id !== 'string') {
            throw new PhotoApiError(500, 'INVALID_PENDING_MEAL_SAVE_DRAFT');
          }

          const snapshotItems = restorePhotoMealItems([], payload);
          if (snapshotItems.length === 0) throw new PhotoApiError(500, 'INVALID_PENDING_MEAL_SAVE_DRAFT');

          currentPhotoJobIdRef.current = pointer.jobId;
          imageKitUrlRef.current = typeof payload.imagine_url === 'string'
            ? payload.imagine_url
            : pointer.imageUrl || null;
          imageKitFileIdRef.current = pointer.imageFileId || null;
          idOperatieSalvareRef.current = pointer.saveOperationId;
          pendingPhotoSavePayloadRef.current = payload;
          setPendingPhotoSaveLocked(true);
          setTipMasaSelectat(normalizeTipMasa(String(payload.tip_masa || '')));
          setRezultat(snapshotItems);
          setPhotoPhase('completed');
          setFailedPhotoJob(null);

          // Read only this owner's exact UUID before offering the retry. A
          // verified existing row completes recovery; an unknown result leaves
          // the original snapshot available for an explicit idempotent retry.
          const reconciliation = await verificaReluareMasa(supabase as never, payload as never);
          if (controller.signal.aborted || !isPhotoOwnerCurrent(userId, accountGeneration)) return;
          if (reconciliation.tip === 'reluare_confirmata') {
            await clearActivePhotoJob(userId, pointer.jobId).catch(() => {});
            if (!isPhotoOwnerCurrent(userId, accountGeneration)) return;
            currentPhotoJobIdRef.current = null;
            idOperatieSalvareRef.current = null;
            pendingPhotoSavePayloadRef.current = null;
            setPendingPhotoSaveLocked(false);
            setRezultat([]);
            marcheazaMeseModificate(userId);
            anuntaMasaSalvataVerificat(userId, [String(payload.id)], [String(payload.data).slice(0, 10)]);
            setSaveSuccessData({
              nume: typeof payload.nume === 'string' ? payload.nume : `${snapshotItems.length} alimente`,
              calorii: Math.round(Number(payload.calorii) || 0),
              proteine: Math.round((Number(payload.proteine) || 0) * 10) / 10,
              carbohidrati: Math.round((Number(payload.carbohidrati) || 0) * 10) / 10,
              grasimi: Math.round((Number(payload.grasimi) || 0) * 10) / 10,
              tip_masa: normalizeTipMasa(String(payload.tip_masa || '')),
              isOffline: false,
            });
          } else if (reconciliation.tip === 'conflict_continut') {
            setRecoveryBlocked(true);
            setScanError(t('alerts.mesaje.conflictOperatieMasa'));
          }
          return;
        }
        currentPhotoJobIdRef.current = active.job.id;
        imageKitUrlRef.current = active.pointer.imageUrl || active.job.imageUrl || null;
        imageKitFileIdRef.current = active.pointer.imageFileId || active.job.imageFileId || null;
        if (active.job.status === 'failed' || active.job.status === 'cancelled') {
          setPhotoPhase('failed');
          setFailedPhotoJob(active);
          return;
        }
        if (active.job.status === 'queued') setAnalysisStage(2);
        else if (active.job.status === 'running' || active.job.status === 'processing') setAnalysisStage(3);
        else if (active.job.status === 'succeeded' || active.job.status === 'completed') setAnalysisStage(4);
        setSeIncarca(true);
        setPhotoPhase(active.job.status === 'succeeded' || active.job.status === 'completed' ? 'completed' : 'background');
        const completed = active.job.status === 'succeeded' || active.job.status === 'completed'
          ? active.job
          : await waitForPhotoJob({
            token, userId, jobId: active.job.id, signal: controller.signal,
            onStatus: (job: PhotoJob) => {
              if (!isPhotoOwnerCurrent(userId, accountGeneration)) return;
              if (job.status === 'queued') setAnalysisStage(2);
              else if (job.status === 'running' || job.status === 'processing') setAnalysisStage(3);
              else if (job.status === 'succeeded' || job.status === 'completed') setAnalysisStage(4);
            },
          });
        if (!controller.signal.aborted && isPhotoOwnerCurrent(userId, accountGeneration)) {
          applyPhotoJobResult(completed, active.pointer, userId, accountGeneration);
          void flowCredits.refresh();
        }
        if (controller.signal.aborted || !isPhotoOwnerCurrent(userId, accountGeneration)) return;
        if (active.pointer.draftUri) {
          await discardLocalImageDraft(active.pointer.draftUri, userId).catch(() => {});
        }
      } catch (error) {
        if (!controller.signal.aborted && isPhotoOwnerCurrent(userId, accountGeneration)
          && !(error instanceof DOMException && error.name === 'AbortError')) {
          setPhotoPhase('failed');
          setScanError(t('camera.genericScanError'));
          setRecoveryBlocked(error instanceof PhotoApiError && (
            error.code === 'INVALID_PENDING_MEAL_SAVE_DRAFT'
            || error.code === 'CORRUPT_ACTIVE_PHOTO_JOB_POINTER'
          ));
        }
      } finally {
        if (!controller.signal.aborted && isPhotoOwnerCurrent(userId, accountGeneration)) {
          setSeIncarca(false);
          setRecoveryChecked(true);
        }
      }
    };
    void recover();
    return () => controller.abort();
  }, [applyPhotoJobResult, isPhotoOwnerCurrent, recoveryAttempt, session?.access_token, session?.user.id, t]);

  const retryFailedPhotoJob = useCallback(async () => {
    if (!failedPhotoJob || !session?.user.id) return;
    const ownerId = session.user.id;
    const accountGeneration = accountGenerationRef.current;
    if (!isPhotoOwnerCurrent(ownerId, accountGeneration)
      || failedPhotoJob.pointer.userId !== ownerId) return;
    const retryUri = failedPhotoJob.pointer.draftUri || failedPhotoJob.pointer.localImageUri;
    if (!retryUri) {
      setFailedPhotoJob(null);
      setPhotoPhase('idle');
      return;
    }
    await clearActivePhotoJob(ownerId, failedPhotoJob.job.id).catch(() => {});
    if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
    setFailedPhotoJob(null);
    await analizeazaImaginea(retryUri, true);
  }, [analizeazaImaginea, failedPhotoJob, isPhotoOwnerCurrent, session?.user.id]);

  // U-03: recuperarea draft-urilor neanalizate.
  //
  // Efectul stă DUPĂ `analizeazaImaginea` intenționat: referirea ei în dep array
  // înaintea declarației `const` ar arunca ReferenceError (temporal dead zone).
  useEffect(() => {
    if (!recoveryChecked || scanError) return;
    if (draftPromptAfisatRef.current) return;
    if (!session?.access_token || !session.user.id || seIncarca || rezultat.length > 0) return;
    draftPromptAfisatRef.current = true;
    const ownerId = session.user.id;
    const accountGeneration = accountGenerationRef.current;

    listPendingDrafts(ownerId)
      .then((pending) => {
        if (pending.length === 0 || !isMountedRef.current
          || !isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
        const ultimulDraft = pending[pending.length - 1];
        Alert.alert(
          t('camera.pendingDraftTitle'),
          t('camera.pendingDraftMessage'),
          [
            {
              text: t('alerts.butoane.anuleaza'),
              style: 'destructive',
              onPress: () => {
                if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
                purgeLocalImageDrafts(ownerId).catch(() => {});
              },
            },
            {
              text: t('camera.resumeAnalysis'),
              onPress: () => {
                if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
                analizeazaImaginea(ultimulDraft);
              },
            },
          ],
        );
      })
      .catch(() => {});
  }, [isPhotoOwnerCurrent, session?.access_token, session?.user.id, analizeazaImaginea, recoveryChecked, rezultat.length, scanError, seIncarca, t]);

  const anuleazaScanarea = useCallback(() => {
    // A prior save response may be ambiguous. Keep its exact payload and job
    // pointer recoverable instead of allowing a rescan to overwrite the retry key.
    if (pendingPhotoSavePayloadRef.current) return;
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
    setScanError(null);
    setSeIncarca(false);
    setPhotoPhase('idle');
    setFailedPhotoJob(null);
    idOperatieSalvareRef.current = null;
    pendingPhotoSavePayloadRef.current = null;
    setPendingPhotoSaveLocked(false);
  }, [session?.user.id]);

  const lasaAnalizaInFundal = useCallback(() => {
    if (!currentPhotoJobIdRef.current) return false;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setSeIncarca(false);
    setPhotoPhase('background');
    return true;
  }, []);

  const mergiLaAcasa = useCallback(() => {
    permitereNavigareRef.current = true;
    if (!currentPhotoJobIdRef.current) {
      shouldGoHomeOnSubmitRef.current = true;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [router]);


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

  const isNonFood = Boolean(
    failedPhotoJob && (
      failedPhotoJob.job.errorCode === 'NOT_FOOD'
      || failedPhotoJob.job.errorCode === 'NO_FOOD'
      || failedPhotoJob.job.errorCode === 'PHOTO_RESULT_EMPTY'
      || failedPhotoJob.job.errorCode === 'EMPTY_RESULT'
      || failedPhotoJob.job.errorCode === 'PHOTO_RESULT_INVALID'
      || (failedPhotoJob.job.result as Record<string, unknown> | undefined)?.isNotFood === true
    )
  );

  const analizeazaFoto = async () => {
    if (!cameraRef.current || isTakingPhotoRef.current || seIncarca || !session) return;
    const ownerId = session.user.id;
    const accountGeneration = accountGenerationRef.current;
    if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
    isTakingPhotoRef.current = true;
    setSeIncarca(true);
    try {
      const foto = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
        shutterSound: false,
      });
      if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
      if (foto && foto.uri) {
        await analizeazaImaginea(foto.uri);
      } else {
        setSeIncarca(false);
      }
    } catch (e) {
      if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
      console.error(`Eroare captură foto: ${e instanceof Error ? e.message : String(e)}`);
      // CAM-005: captura eșuată nu rămâne mută — mesaj vizibil + stare curățată.
      setSeIncarca(false);
      setScanError(t('camera.captureFailed', 'Nu am putut captura fotografia. Te rugăm să încerci din nou sau să alegi din galerie.'));
    } finally {
      isTakingPhotoRef.current = false;
    }
  };

  const alegeDinGalerie = useCallback(async () => {
    if (seIncarca || !session) return;
    const ownerId = session.user.id;
    const accountGeneration = accountGenerationRef.current;
    if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
    try {
      if (Platform.OS === 'ios') {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
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
      if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;

      if (!result.canceled && result.assets && result.assets.length > 0) {
        analizeazaImaginea(result.assets[0].uri);
      }
    } catch (e) {
      if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
      console.error(`Eroare galerie: ${e instanceof Error ? e.message : String(e)}`);
      Alert.alert(t('alerts.titluri.eroare'), t('alerts.mesaje.galerieInaccesibila'));
    }
  }, [analizeazaImaginea, isPhotoOwnerCurrent, seIncarca, session, t]);

  const handleRetakePhoto = useCallback(() => {
    setFailedPhotoJob(null);
    setScanError(null);
    setPhotoPhase('idle');
    anuleazaScanarea();
  }, [anuleazaScanarea]);

  const handleGalleryFromNotFood = useCallback(() => {
    setFailedPhotoJob(null);
    setScanError(null);
    setPhotoPhase('idle');
    anuleazaScanarea();
    void alegeDinGalerie();
  }, [alegeDinGalerie, anuleazaScanarea]);

  const handleHomeFromNotFood = useCallback(() => {
    setFailedPhotoJob(null);
    setScanError(null);
    setPhotoPhase('idle');
    anuleazaScanarea();
    permitereNavigareRef.current = true;
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [anuleazaScanarea, router]);

  const [saveFailureError, setSaveFailureError] = useState<string | null>(null);

  const salveazaOfflineDirect = useCallback(async () => {
    if (!rezultat || rezultat.length === 0 || !session || isSavingDiary) return;
    const ownerId = session.user.id;
    const now = new Date();
    if (!idOperatieSalvareRef.current) idOperatieSalvareRef.current = idOperatieNoua();
    const payload = construiestePayloadMasaCamera({
      idOperatie: idOperatieSalvareRef.current,
      user_id: ownerId,
      rezultat,
      now,
      tip_masa: tipMasaSelectat,
      poza: { url: imageKitUrlRef.current, fileId: imageKitFileIdRef.current },
    }).payload;
    const payloadOffline: MasaOfflinePayload = {
      ...(payload as unknown as MasaOfflinePayload),
      created_at: typeof payload.created_at === 'string' ? payload.created_at : now.toISOString(),
    };
    const { persistat } = await pushOfflineMealVerificat(payloadOffline);
    if (persistat) {
      setSaveFailureError(null);
      setSaveSuccessData({
        nume: typeof payload.nume === 'string' ? payload.nume : (rezultat.length === 1 ? rezultat[0].nume : `${rezultat.length} alimente`),
        calorii: Math.round(totalCalculat.calorii),
        proteine: Math.round(totalCalculat.proteine * 10) / 10,
        carbohidrati: Math.round(totalCalculat.carbohidrati * 10) / 10,
        grasimi: Math.round(totalCalculat.grasimi * 10) / 10,
        tip_masa: tipMasaSelectat,
        isOffline: true,
      });
    }
  }, [rezultat, session, isSavingDiary, tipMasaSelectat, totalCalculat]);

  const adaugaInJurnal = async () => {
    if (!rezultat || rezultat.length === 0 || !session || isSavingDiary || activeSaveAttemptRef.current !== null) return;
    const ownerId = session.user.id;
    const accountGeneration = accountGenerationRef.current;
    if (!isPhotoOwnerCurrent(ownerId, accountGeneration) || photoStateOwnerId !== ownerId) return;

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
      user_id: ownerId,
      rezultat,
      now,
      tip_masa: tipMasaSelectat,
      poza: { url: imageKitUrlRef.current, fileId: imageKitFileIdRef.current },
    }).payload;
    const payloadCurent: Record<string, unknown> = { ...payloadInitial };
    const savedPayload = pendingPhotoSavePayloadRef.current;
    if (savedPayload && !photoMealDraftMatches(payloadCurent, savedPayload)) {
      Alert.alert(
        t('alerts.titluri.eroareSalvare'),
        t('alerts.mesaje.conflictOperatieMasa'),
      );
      return;
    }
    const saveAttemptToken = ++saveAttemptSequenceRef.current;
    activeSaveAttemptRef.current = saveAttemptToken;
    setIsSavingDiary(true);
    // Reuse the exact reviewed draft (including local date/time) after restart.
    const payload: Record<string, unknown> = savedPayload || payloadCurent;
    const mealName = typeof payload.nume === 'string'
      ? payload.nume
      : (rezultat.length === 1 ? rezultat[0].nume : `${rezultat.length} alimente`);

    try {
      // Persist the retry identity and exact user-reviewed payload before the
      // write so an app/process restart cannot alter category, portions or date.
      if (currentPhotoJobIdRef.current) {
        const saved = await savePhotoJobSaveAttempt(
          ownerId,
          currentPhotoJobIdRef.current,
          idOperatieSalvareRef.current!,
          payload,
        );
        if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
        if (!saved) {
          Alert.alert(
            t('alerts.titluri.eroareSalvare'),
            t('alerts.mesaje.problemaNecunoscutaConectare'),
          );
          return;
        }
        pendingPhotoSavePayloadRef.current = payload;
        setPendingPhotoSaveLocked(true);
      }

      const { data, error } = await insereazaMasaCuPoza(supabase, payload);
      if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;

      if (error && !esteEroareDuplicate(error)) throw error;

      // A response without the inserted row is not success. This can happen if
      // a project has INSERT but no visible SELECT policy, or when the transport
      // response is incomplete. Read back the deterministic row under the same
      // Supabase Auth/RLS session before clearing the retained photo result.
      if (error || !raspunsInsertMasaConfirmat(data, payload)) {
        const verificare = await verificaReluareMasa(supabase as never, payload as never);
        if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
        if (verificare.tip === 'conflict_continut') {
          Alert.alert(
            t('alerts.titluri.eroareSalvare'),
            t('alerts.mesaje.conflictOperatieMasa'),
          );
          return;
        }
        if (verificare.tip === 'necunoscut') {
          Alert.alert(
            t('alerts.titluri.eroareSalvare'),
            t('alerts.mesaje.problemaNecunoscutaConectare'),
          );
          // Keep the operation ID: a retry must check/reuse the same row rather
          // than silently creating a second meal after an ambiguous response.
          return;
        }
      }

      // P1-01: scriere confirmată — acțiunea logică s-a încheiat. O salvare
      // ulterioară pornește o operație nouă, deci poate crea un rând nou.
      idOperatieSalvareRef.current = null;
      pendingPhotoSavePayloadRef.current = null;
      setPendingPhotoSaveLocked(false);
      if (currentPhotoJobIdRef.current) {
        await clearActivePhotoJob(ownerId, currentPhotoJobIdRef.current).catch(() => {});
        if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
        currentPhotoJobIdRef.current = null;
      }
      // P1-04: persistare dovedită → invalidare deterministă a datelor canonice.
      marcheazaMeseModificate(ownerId);
      anuntaMasaSalvataVerificat(ownerId, [String(payload.id)], [String(payload.data).slice(0, 10)]);
      setSaveFailureError(null);

      setSaveSuccessData({
        nume: mealName,
        calorii: Math.round(totalCalculat.calorii),
        proteine: Math.round(totalCalculat.proteine * 10) / 10,
        carbohidrati: Math.round(totalCalculat.carbohidrati * 10) / 10,
        grasimi: Math.round(totalCalculat.grasimi * 10) / 10,
        tip_masa: tipMasaSelectat,
        isOffline: false,
      });
    } catch (e: unknown) {
      if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
      console.error('[adaugaInJurnal]', e);
      const clasificare = clasificaRezultatInsertMasa(
        e instanceof Error ? e : { error: e },
      );

      // Erorile structurate ale serverului (RLS, CHECK, validare) și erorile
      // locale de programare NU sunt dovezi de offline. Punerea lor în coadă ar
      // afișa un succes fals și ar relua la nesfârșit o scriere pe care serverul
      // o va refuza determinist. Doar transportul verificat intră în coadă.
      if (clasificare.tip !== 'offline') {
        // Keep the persisted ID on deterministic failure so an app restart
        // cannot turn an ambiguous write into a second meal.
        const mesaj = clasificare.tip === 'eroare_server'
          ? clasificare.mesaj
          : t('alerts.mesaje.eroareNecunoscutaSalvareMasa');
        setSaveFailureError(t('camera.saveFailedMessage', 'Nu am putut salva masa. Modificările au fost păstrate.'));
        Alert.alert(
          t('alerts.titluri.eroareSalvare'),
          t('alerts.mesaje.bazaDateRefuza', { eroare: mesaj }),
        );
        return;
      }

      const mesajEroare = clasificare.motiv;
      // U-04: salvare în coada offline FIFO pe eroare de conexiune/rețea
      try {
        if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
        const payloadOffline: MasaOfflinePayload = {
          ...(payload as unknown as MasaOfflinePayload),
          created_at: typeof payload.created_at === 'string' ? payload.created_at : now.toISOString(),
        };
        // F-11: nu confirmam „Salvat offline" decat daca masa a ajuns cu adevarat
        // pe disc. Fara verificare, o scriere esuata (storage plin, SQLite ocupat)
        // lasa masa doar in memorie, iar ea dispare la inchiderea aplicatiei —
        // dupa ce utilizatorului i s-a spus ca e in siguranta.
        const { persistat } = await pushOfflineMealVerificat(payloadOffline);
        if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
        if (!persistat) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert(t('alerts.titluri.eroareSalvare'), t('offline.masaNesalvataOffline'));
          return;
        }
        if (currentPhotoJobIdRef.current) {
          await clearActivePhotoJob(ownerId, currentPhotoJobIdRef.current).catch(() => {});
          if (!isPhotoOwnerCurrent(ownerId, accountGeneration)) return;
          currentPhotoJobIdRef.current = null;
        }
        pendingPhotoSavePayloadRef.current = null;
        setPendingPhotoSaveLocked(false);
        idOperatieSalvareRef.current = null;
        setSaveSuccessData({
          nume: mealName,
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
      if (activeSaveAttemptRef.current === saveAttemptToken) {
        activeSaveAttemptRef.current = null;
        if (isPhotoOwnerCurrent(ownerId, accountGeneration)) setIsSavingDiary(false);
      }
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

  // Hide old-account camera state during the render before the account-change
  // effect clears it; this closes the one-frame cross-account visibility gap.
  if (photoStateOwnerId !== sessionUserId) {
    return (
      <View testID="camera-account-transition" style={[styles.permissionContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
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
        active={rezultat.length === 0 && !isNonFood}
      />

      <LinearGradient
        colors={['rgba(5,8,13,0.85)', 'rgba(5,8,13,0)', 'rgba(5,8,13,0.95)']}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      {/* Box Scanare */}
      <View style={[styles.scanArea, StyleSheet.absoluteFillObject]} pointerEvents="box-none">
        <View style={[styles.scanBox, { width: scanBoxSize, height: scanBoxSize, borderColor: colors.cardBorder }]}>
          <View style={[styles.corner, styles.cornerTL, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerTR, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerBL, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerBR, { borderColor: colors.accent }]} />

          {seIncarca && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.scanningOverlay} accessibilityLiveRegion="polite">
              <BlurView intensity={70} tint="dark" style={styles.scanningBlur}>
                <Text style={[styles.stagesCardTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
                  {t('camera.activeAnalysisTitle')}
                </Text>

                <View style={styles.stagesContainer}>
                  {[
                    { stage: 1, key: 'stagePreparing' },
                    { stage: 2, key: 'stageQueued' },
                    { stage: 3, key: 'stageAnalyzing' },
                    { stage: 4, key: 'stageFinalizing' },
                  ].map((s) => {
                    const isDone = s.stage < analysisStage;
                    const isActive = s.stage === analysisStage;
                    const isPending = s.stage > analysisStage;
                    return (
                      <View key={s.stage} style={styles.stageRow}>
                        <View style={styles.stageIndicatorCol}>
                          <View style={[
                            styles.stageDot,
                            isDone && styles.stageDotCompleted,
                            isActive && [styles.stageDotActive, { borderColor: colors.accent }],
                            isPending && styles.stageDotPending,
                          ]}>
                            {isDone ? (
                              <Check size={11} color="#10B981" strokeWidth={3} />
                            ) : isActive ? (
                              <ActivityIndicator size="small" color={colors.accent} style={{ transform: [{ scale: 0.7 }] }} />
                            ) : (
                              <View style={styles.stagePendingInnerDot} />
                            )}
                          </View>
                          {s.stage < 4 && (
                            <View style={[
                              styles.stageConnector,
                              isDone ? styles.stageConnectorCompleted : styles.stageConnectorPending,
                            ]} />
                          )}
                        </View>
                        <Text
                          maxFontSizeMultiplier={1.3}
                          style={[
                            styles.stageText,
                            isDone && styles.stageTextCompleted,
                            isActive && [styles.stageTextActive, { color: colors.accent }],
                            isPending && styles.stageTextPending,
                          ]}
                        >
                          {t(`camera.${s.key}`)}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* Butonul aprobat de trecere în fundal: Mergi la Acasă / Go to Home */}
                <Pressable
                  testID="camera-go-home-btn"
                  onPress={mergiLaAcasa}
                  style={styles.goHomeBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('camera.goToHome')}
                >
                  <Home size={16} color={colors.accent} style={{ marginRight: 6 }} />
                  <Text style={[styles.goHomeBtnText, { color: colors.accent }]}>
                    {t('camera.goToHome')}
                  </Text>
                </Pressable>
              </BlurView>
            </Animated.View>
          )}

        </View>
        <Text style={styles.scanHint}>{t('camera.scanHint')}</Text>
      </View>

      {isNonFood ? (
        <PhotoMealErrorView
          testID="camera-not-food-card"
          errorType="not_food"
          customMessage={scanError}
          onRetake={handleRetakePhoto}
          onGallery={handleGalleryFromNotFood}
          onHome={handleHomeFromNotFood}
        />
      ) : failedPhotoJob ? (
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

      {/* Photo AI 2.0: Option A Athletic Pro HUD Result View */}
      {rezultat.length > 0 && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View entering={FadeInUp.duration(500).springify()} style={[styles.resultSheet, { borderColor: colors.accent + '26' }]}>
            <PhotoMealResultView
              rezultat={rezultat}
              photoUri={imageKitUrlRef.current}
              tipMasa={tipMasaSelectat}
              onChangeTipMasa={setTipMasaSelectat}
              onUpdateRezultat={setRezultat}
              onSaveToJournal={adaugaInJurnal}
              onCancelAndRescan={anuleazaScanarea}
              isSaving={isSavingDiary}
              saveFailureMessage={saveFailureError}
              onRetrySave={adaugaInJurnal}
              onSaveOffline={salveazaOfflineDirect}
              requiresReview={quality.requiresReview}
              disabled={recoveryBlocked}
              pendingPhotoSaveLocked={pendingPhotoSaveLocked}
              bottomInset={insets.bottom}
            />
          </Animated.View>
        </KeyboardAvoidingView>
      )}

      {scanError && !isNonFood && (
        <View style={[styles.errorCard, { top: insets.top + 78 }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <Text maxFontSizeMultiplier={1.3} style={styles.errorText}>{scanError}</Text>
          {recoveryBlocked ? (
            <Pressable
              testID="camera-recovery-retry"
              onPress={() => {
                setRecoveryBlocked(false);
                setScanError(null);
                setRecoveryAttempt((attempt) => attempt + 1);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('photoJob.retry')}
            >
              <Text maxFontSizeMultiplier={1.3} style={styles.retryText}>{t('photoJob.retry')}</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => setScanError(null)} accessibilityRole="button" accessibilityLabel={t('camera.closeErrorA11y')}>
              <Text maxFontSizeMultiplier={1.3} style={styles.retryText}>{t('common.close')}</Text>
            </Pressable>
          )}
        </View>
      )}

      {isSavingDiary && (
        <View style={styles.savingOverlay} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={colors.accent} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.savingText, { color: colors.accent }]}>{t('camera.savingToJournal')}</Text>
        </View>
      )}

      {/* Shutter & Gallery button */}
      {rezultat.length === 0 && !isNonFood && !failedPhotoJob && (
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
  goHomeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 22,
    backgroundColor: 'rgba(204, 255, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(204, 255, 0, 0.35)',
    minHeight: 44,
  },
  goHomeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  stagesCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    textAlign: 'center',
  },
  stagesContainer: {
    width: '100%',
    paddingHorizontal: 6,
    marginBottom: 2,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 26,
  },
  stageIndicatorCol: {
    alignItems: 'center',
    width: 20,
    marginRight: 8,
  },
  stageDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  stageDotCompleted: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  stageDotActive: {
    backgroundColor: 'rgba(204, 255, 0, 0.12)',
  },
  stageDotPending: {
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'transparent',
  },
  stagePendingInnerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  stageConnector: {
    width: 2,
    height: 10,
    marginVertical: 1,
  },
  stageConnectorCompleted: {
    backgroundColor: '#10B981',
  },
  stageConnectorPending: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  stageText: {
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  stageTextCompleted: {
    color: '#10B981',
    fontWeight: '600',
  },
  stageTextActive: {
    fontWeight: '800',
  },
  stageTextPending: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: '500',
  },
});
