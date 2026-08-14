
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator, Image, Pressable, Text, View, StyleSheet, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform, Modal, Linking,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect, useNavigation } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabase';
import { API_URL } from '@/constants/config';
import { API_PREFIX } from '@/lib/api';
import Animated, { FadeIn, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { Scan, Zap, ChevronDown, Plus, Trash2, Image as ImageIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { clampValoare, LIMITE_DB_MESE, MEAL_CATEGORIES, CATEGORIE_ICONA, getTipMasaDupaOra, insereazaMasaCuPoza } from '../lib/mealUtils';
import { construiestePayloadMasaCamera, esteEroareDuplicate, eliminaAlimentScanat } from '../lib/payloadMese';
import { GramInput } from '../components/ui/GramInput';
import { ProductSearch } from '../components/food/ProductSearch';
import { foodProductToAlimentAI } from '../components/food/types';
import { type AlimentScanat } from '@/components/food/FoodScanSuccessModal';
import type { TipMasa } from '../types';
import { FontSize } from '../constants/theme';
import IngredientCorrectionInput from '@/components/food/IngredientCorrectionInput';
import { uploadImageToImageKit } from '@/lib/imagekit';
import { optimizeImageBeforeUpload, saveLocalImageDraft, discardLocalImageDraft, listPendingDrafts } from '@/lib/imageOptimizer';
import { pushOfflineMeal, processOfflineQueue, MasaOfflinePayload } from '@/lib/offlineQueue';
import { useReducedMotion } from '@/hooks/useReducedMotion';


// Starea unui furnizor AI primită de la /ai-status și din câmpul `stareAI` al
// răspunsului de analiză. REMED-021: tipare înlocuiește `any`.
interface StareAiStatus {
  nume: string;
  status: string;
  secundeRamase: number;
  mesaj: string;
}

export default function CameraScreen() {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  // Dimensiuni reactive (fold/unfold pe dispozitive); scan box limitat la 48%
  // din inaltime sau 360px ca sa nu depaseasca ecranul pe telefoane mici/landscape.
  const scanBoxSize = Math.round(Math.min(width * 0.78, height * 0.48, 360));
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

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
  const [totaluri, setTotaluri] = useState<{ kcal: number; proteine: number; grasimi: number; carbohidrati: number } | null>(null);
  const ingredienteIdentificate = rezultat;
  const setIngredienteIdentificate = setRezultat;
  const [isSavingDiary, setIsSavingDiary] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [seIncarca, setSeIncarca] = useState(false);
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const [selectedAI, setSelectedAI] = useState<'auto' | 'gemini' | 'openai' | 'groq'>('auto');

  const [aiMenuVisible, setAiMenuVisible] = useState(false);
  const [cautareProdusVisible, setCautareProdusVisible] = useState(false);
  const [aiStatus, setAiStatus] = useState<Record<string, StareAiStatus>>({});
  // REMED-009: categoria mesei scanate — implicit = sugestia după oră, dar
  // utilizatorul o poate suprascrie din chip-urile din foaia de review.
  const [tipMasaSelectat, setTipMasaSelectat] = useState<TipMasa>(() => getTipMasaDupaOra(new Date()));
  // REMED-008: URI-ul LOCAL al pozei scanate (înainte de upload ImageKit) folosit
  // ca miniatură în review — disponibil instant, fără să așteptăm CDN-ul.
  const [pozaScanPreview, setPozaScanPreview] = useState<string | null>(null);

  const cameraRef = useRef<CameraView>(null);
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
  const imageKitUploadRef = useRef<{ generatie: number; promise: Promise<void> } | null>(null);
  const draftCurrentUriRef = useRef<string | null>(null);
  // U-03: garanteaza ca dialogul de recuperare a draft-ului apare o singura data
  // pe sesiunea ecranului, chiar daca efectul se re-executa la schimbarea tokenului.
  const draftPromptAfisatRef = useRef(false);
  const router = useRouter();

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
  }, [seIncarca]);

  useEffect(() => {
    if (session?.user?.id) {
      processOfflineQueue(supabase).catch(() => {});
    }
  }, [session?.user?.id]);


  useFocusEffect(
    useCallback(() => {
      let active = true;
      const fetchStatus = async () => {
        try {
          const res = await fetch(`${API_URL}${API_PREFIX}/ai-status`, {
            headers: {
              Authorization: session?.access_token
                ? `Bearer ${session.access_token}`
                : '',
            },
          });
          if (res.ok) {
            const data = await res.json();
            if (active) setAiStatus(data);
          }
        } catch {
          // Polling necritic - erorile sunt normale in dev
          // nu trebuie sa blocheze UI-ul, dar e util in development.
          if (__DEV__) console.debug('[Camera] Status AI indisponibil (posibil offline).');
        }
      };
      fetchStatus();
      // Polling la 30s (evita 429 rate-limit)
      // /api/ai-status este acum exclus din rate-limiter \u00een backend, dar men\u021binem intervalul mare
      // pentru a nu consuma inutil resurse de re\u021bea \u0219i baterie.
      const timer = setInterval(fetchStatus, 30000);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [session?.access_token])
  );

  const updateIngredient = useCallback(
    (index: number, patch: Partial<AlimentScanat>) => {
      setTotaluri(null);
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
    setTotaluri(null);
    setRezultat((current) => eliminaAlimentScanat(current, index));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const analizeazaImaginea = useCallback(
    async (imageUri: string) => {
      if (!session?.access_token) {
        setScanError('Sesiunea a expirat. Autentifică-te din nou.');
        return;
      }

      abortControllerRef.current?.abort();

      // CAM-003: un nou scan invalidează orice upload ImageKit încă în zbor din
      // scanul anterior — rezultatul lui nu mai poate suprascrie refs-urile.
      uploadGenerationRef.current += 1;
      imageKitUploadRef.current = null;

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setScanError(null);
      setRezultat([]);
      setSeIncarca(true);

      // CAM-004: timeout pentru cererea de analiză AI — un răspuns care nu mai
      // vine nu trebuie să țină ecranul în starea „Se încarcă" la nesfârșit
      // (~75s = optimizare client + cascada AI pe server).
      let timeoutDepasit = false;
      const timeoutId = setTimeout(() => {
        timeoutDepasit = true;
        controller.abort();
      }, 75000);

      try {
        // B-20: redimensionam pe client inainte de upload. Serverul pastreaza
        // base64-ul necesar pe toata cascada AI, dar un Buffer brut in plus in
        // heap dubleaza varful de memorie fara castig. Reducerea reala de payload
        // (si de cost AI) vine de aici: de la ~15MB la <200KB.
        const imagineOptimizata = await optimizeImageBeforeUpload(imageUri);
        // U-03: Salvează poza în stocarea persistentă locală înainte de upload ca să nu fie pierdută la căderea rețelei
        const draftPersistentUri = await saveLocalImageDraft(imagineOptimizata.uri);
        draftCurrentUriRef.current = draftPersistentUri;

        const formData = new FormData();

        formData.append('imagine', {
          uri: imagineOptimizata.uri,
          name: `nutriai-${Date.now()}.jpg`,
          type: 'image/jpeg',
        } as unknown as Blob);
        formData.append('provider', selectedAI);

        const response = await fetch(
          `${API_URL}${API_PREFIX}/analizeaza-mancare-structurat`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            body: formData,
            signal: controller.signal,
          },
        );

        const payload = (await response.json()) as
          | AlimentScanat[]
          | { eroare?: string; stareAI?: Record<string, StareAiStatus> };

        if (controller.signal.aborted) return;

        if (payload && !Array.isArray(payload) && payload.stareAI && isMountedRef.current) {
          setAiStatus(payload.stareAI);
        }

        if (!response.ok || !Array.isArray(payload)) {
          let message = t('camera.unidentifiedFoods');
          if (!Array.isArray(payload) && payload && payload.eroare) {
            message = payload.eroare;
          } else if (response.status === 404) {
            message = `Eroare 404: Endpoint (${API_URL}).`;
          } else if (response.status === 401) {
            message = t('chat.errorNotAuthed');
          } else if (response.status >= 500) {
            message = t('chat.errorServer');
          }
          throw new Error(message);
        }

        // Analiza a reșit → ștergem draftul local persistent
        await discardLocalImageDraft(draftPersistentUri).catch(() => {});

        const normalized = payload
          .map((item) => ({
            nume: String(item.nume || t('camera.unidentifiedFoodDefault')),
            // BUG-019: gramaj plafonat la 5000g (limita validatorului backend) ca
            // un rând astronomic (5000g × kcal_per_100g) să nu umfle totalurile.
            estimare_grame: clampValoare(Number(item.estimare_grame) || 100, LIMITE_DB_MESE.gramaj, 1),
            calorii_per_100g: clampValoare(Number(item.calorii_per_100g) || 0, 1000, 0),
            proteine_per_100g: Math.max(0, Number(item.proteine_per_100g) || 0),
            grasimi_per_100g: Math.max(0, Number(item.grasimi_per_100g) || 0),
            carbohidrati_per_100g: Math.max(
              0,
              Number(item.carbohidrati_per_100g) || 0,
            ),
          }))
          .filter((item) => item.nume.trim().length > 0);

        // CAM-001: un array gol înseamnă că AI-ul n-a identificat niciun aliment.
        // Îl tratăm ca eșec (fără succes fals, fără foaie/modal goale de salvat).
        if (normalized.length === 0) {
          throw new Error(t('camera.unidentifiedFoods'));
        }

        setRezultat(normalized);
        // REMED-008/009: aducem în stare poza locală scanată (miniatura din review)
        // și re-propunem categoria după ora curentă, ca utilizatorul să o suprascrie.
        setPozaScanPreview(imagineOptimizata.uri);
        setTipMasaSelectat(getTipMasaDupaOra(new Date()));
        // BUG-019/014: nu mai afișăm modalul read-only peste foaia de rezultat
        // editabilă — foaia de mai jos (gramaj inline + ștergere + adăugare) este
        // singura suprafață de review, iar `rezultat` rămâne în stare până la
        // confirmarea explicită „Adaugă în Jurnal" sau anulare.
        // Dupa un scan REUSIT, incarcam poza pe ImageKit CDN (nu aruncam gunoi pe CDN
        // pentru poze esuate). URL-ul + fileId-ul ajung in masa salvata (campul
        // alimente, JSONB) ca stergearea GDPR sa cunoasca assetul.
        imageKitUrlRef.current = null;
        imageKitFileIdRef.current = null;
        const generatieUpload = uploadGenerationRef.current;
        imageKitUploadRef.current = {
          generatie: generatieUpload,
          promise: uploadImageToImageKit(imageUri)
            .then((r) => {
              // CAM-003: dacă între timp a pornit un alt scan, acest upload e stale.
              if (uploadGenerationRef.current !== generatieUpload) return;
              imageKitUrlRef.current = r.url;
              imageKitFileIdRef.current = r.fileId;
            })
            .catch((ikErr) => {
              if (__DEV__) console.log('ImageKit upload notice:', ikErr.message);
            }),
        };
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      } catch (error) {
        // Un scan nou (sau unmount/anulare) a invalidat această cerere →
        // nu mai atingem starea, nici măcar pentru mesajul de timeout.
        if (abortControllerRef.current !== controller) return;

        setScanError(
          timeoutDepasit
            ? t('camera.timeoutError')
            : error instanceof Error
              ? error.message
              : t('camera.genericScanError'),
        );
      } finally {
        clearTimeout(timeoutId);
        // CAM-006: doar cererea CURENTĂ își poate reseta starea de încărcare —
        // altfel un scan vechi care se termină târziu ar opri spinner-ul scanului nou.
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          if (isMountedRef.current) setSeIncarca(false);
        }
      }
    },
    [session?.access_token, selectedAI],
  );

  // U-03: recuperarea draft-urilor neanalizate.
  //
  // Efectul stă DUPĂ `analizeazaImaginea` intenționat: referirea ei în dep array
  // înaintea declarației `const` ar arunca ReferenceError (temporal dead zone).
  //
  // Depinde de `session?.access_token` pentru că la montare AuthContext încă se
  // încarcă și sesiunea e null. Pornit cu `[]`, dialogul ar fi apărut cu un
  // closure învechit, iar "Reia analiza" ar fi eșuat cu "Sesiunea a expirat".
  useEffect(() => {
    if (draftPromptAfisatRef.current) return;
    if (!session?.access_token) return;
    draftPromptAfisatRef.current = true;

    listPendingDrafts()
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
                discardLocalImageDraft(ultimulDraft).catch(() => {});
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
  }, [session?.access_token, analizeazaImaginea]);

  const anuleazaScanarea = useCallback(() => {
    if (draftCurrentUriRef.current) {
      discardLocalImageDraft(draftCurrentUriRef.current).catch(() => {});
      draftCurrentUriRef.current = null;
    }
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setTotaluri(null);
    setRezultat([]);
    setPozaScanPreview(null);
    setScanError(null);
    setSeIncarca(false);
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
  }, [navigation, rezultat.length, seIncarca, anuleazaScanarea, t]);

  const trimiteCorectieText = async (textCorectie: string) => {
    try {
      if (__DEV__) console.log('[Camera] Trimit corecție:', textCorectie.substring(0, 50));
      
      const response = await fetch(`${API_URL}${API_PREFIX}/corecteaza-mancare-vizual-text`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        // Backend-ul are nevoie exact de acești parametri
        body: JSON.stringify({ 
          current_ingredients: ingredienteIdentificate, 
          user_prompt: textCorectie 
        })
      });

      // 1. Citim răspunsul serverului INDIFERENT dacă a crăpat sau nu, ca să vedem mesajul real
      const data = await response.json(); 
      if (__DEV__) console.log('[Camera] Răspuns corecție backend primit.');

      // 2. Dacă a crăpat (400, 401, 500 etc), afișăm motivul exact pe ecran
      if (!response.ok) {
         Alert.alert(t('alerts.titluri.eroareServerAI'), data.eroare || t('alerts.mesaje.problemaNecunoscutaConectare'));
         throw new Error(data.eroare || "Eroare de la server");
      }

      // 3. Dacă e totul în regulă, actualizăm datele pe ecran
      if (data.ingredients) {
        setIngredienteIdentificate(data.ingredients);
        // Depinde de cum ai denumit starea pentru totaluri, asigură-te că numele funcției e corect (ex: setTotaluri)
        if (data.new_totals) {
            setTotaluri(data.new_totals); 
        }
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

  const totalCalculat = useMemo(() => {
    if (totaluri) {
      return {
        calorii: totaluri.kcal,
        proteine: totaluri.proteine,
        grasimi: totaluri.grasimi,
        carbohidrati: totaluri.carbohidrati,
      };
    }
    return (rezultat || []).reduce((acc, item) => {
      const factor = (item.estimare_grame || 0) / 100;
      return {
        calorii: acc.calorii + (item.calorii_per_100g || 0) * factor,
        proteine: acc.proteine + (item.proteine_per_100g || 0) * factor,
        grasimi: acc.grasimi + (item.grasimi_per_100g || 0) * factor,
        carbohidrati: acc.carbohidrati + (item.carbohidrati_per_100g || 0) * factor,
      };
    }, { calorii: 0, proteine: 0, grasimi: 0, carbohidrati: 0 });
  }, [rezultat, totaluri]);

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
      setScanError('Nu am putut captura imaginea. Încearcă din nou.');
    }
  };

  const alegeDinGalerie = async () => {
    if (seIncarca || !session) return;
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(t('alerts.titluri.permisiuneNecesara'), t('alerts.mesaje.permisiuneGaleriePoze'));
        return;
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

    // CAM-003: așteptăm (cu timeout) uploadul ImageKit al scanului curent ca poza
    // să ajungă de obicei în masa salvată; un upload lent/eșuat nu blochează salvarea.
    const uploadCurent = imageKitUploadRef.current;
    if (uploadCurent) {
      try {
        await Promise.race([
          uploadCurent.promise,
          new Promise((resolve) => setTimeout(resolve, 3500)),
        ]);
      } catch {}
    }

    // FIX 2.5 + BUG-019: per-100g → valori absolute, normalizate și clampate la
    // limitele CHECK-urilor din Postgres (calorii ≤10000, proteine/grasimi ≤1000,
    // carbohidrati ≤2000, fibre ≤500). Id-ul UUID e determinist din conținutul
    // scanului: reluarea aceleiași salvări (dublu-tap, retry) se ciocnește pe PK
    // 23505 și e tratată ca „deja adăugată", nu ca rând duplicat.
    const payloadInitial = construiestePayloadMasaCamera({
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
          // Idempotență: masa a fost deja adăugată (același id) — fără duplicat.
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(t('alerts.titluri.succes'), t('alerts.mesaje.masaAdaugataJurnal'), [
            { text: t('alerts.butoane.superPunct'), onPress: () => { permitereNavigareRef.current = true; router.replace('/(tabs)'); } },
          ]);
          return;
        }
        throw error;
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t('alerts.titluri.succes'), t('alerts.mesaje.masaAdaugataJurnal'), [
        { text: t('alerts.butoane.superPunct'), onPress: () => { permitereNavigareRef.current = true; router.replace('/(tabs)'); } },
      ]);
    } catch (e: unknown) {
      console.error('[adaugaInJurnal]', e);
      const mesajEroare = e instanceof Error ? e.message : '';
      // U-04: salvare în coada offline FIFO pe eroare de conexiune/rețea
      try {
        const payloadOffline: MasaOfflinePayload = {
          ...payload,
          created_at: now.toISOString(),
        };
        await pushOfflineMeal(payloadOffline);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          t('offline.salvatOffline'),
          t('offline.masaSalvataOffline'),
          [{ text: 'OK', onPress: () => { permitereNavigareRef.current = true; router.replace('/(tabs)'); } }]
        );
      } catch (_errOffline) {
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

          <TouchableOpacity style={styles.cancelLink} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('camera.back')} hitSlop={12}>
            <Text style={[styles.cancelLinkText, { color: colors.textSecondary }]}>{t('camera.back')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topHeader, { top: insets.top + 10 }]}>
        {/* Selector AI în Stânga */}
        <View style={styles.aiSelectorContainer}>
          <TouchableOpacity
            style={[styles.topBadge, { backgroundColor: 'transparent', borderWidth: 0, zIndex: 9999 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAiMenuVisible(prev => !prev);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('camera.aiDropdownTitle')}
            accessibilityHint={t('camera.aiDropdownTitle')}
          >
            <View style={[styles.topBadgeBlur, { paddingVertical: 8 }]}>
              <Zap size={14} color={colors.accent} fill={colors.accent} />
              <Text maxFontSizeMultiplier={1.3} style={[styles.topBadgeText, { color: colors.textPrimary }]}>
                {selectedAI === 'auto' ? t('camera.smartAI') : selectedAI.toUpperCase()}
              </Text>
              <ChevronDown size={14} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Buton X în Dreapta (Fără să se suprapună) */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => { permitereNavigareRef.current = true; anuleazaScanarea(); router.back(); }}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Închide camera"
          accessibilityHint="Renunță la scanare și revino la ecranul anterior"
        >
          <Text style={styles.closeButtonText}>X</Text>
        </TouchableOpacity>
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

        {/* Meniu alegere AI */}
        {aiMenuVisible && (
          <Animated.View entering={FadeIn.duration(200)} style={[styles.aiDropdownMenu, { top: insets.top + 74, backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
            <BlurView intensity={80} tint="dark" style={styles.aiDropdownBlur}>
              <Text maxFontSizeMultiplier={1.3} style={styles.aiDropdownHeader}>SELECTEAZĂ CREIERUL AI</Text>
              
              {(['auto', 'gemini', 'openai', 'groq'] as const).map((aiKey) => {
                const info = aiStatus[aiKey === 'auto' ? 'gemini' : aiKey];
                const isCooldown = info?.status === 'cooldown' || info?.status === 'rate_limit';
                const isSelected = selectedAI === aiKey;

                return (
                  <TouchableOpacity
                    key={aiKey}
                    style={[
                      styles.aiDropdownItem,
                      isSelected && { backgroundColor: colors.accent + '22', borderColor: colors.accent }
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedAI(aiKey);
                      setAiMenuVisible(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Selectează furnizorul ${aiKey === 'auto' ? 'NutriAI Auto' : aiKey}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text maxFontSizeMultiplier={1.3} style={[styles.aiDropdownTitle, isSelected && { color: colors.accent }]}>
                        {aiKey === 'auto' ? '✨ NutriAI Auto-Routing (Recomandat)' : 
                         aiKey === 'gemini' ? '🧠 Google Gemini Pro Vision' :
                         aiKey === 'openai' ? '👁️ OpenAI GPT-4o Mini' : '⚡ Groq LLaVA Fast'}
                      </Text>
                      <Text maxFontSizeMultiplier={1.3} style={styles.aiDropdownDesc}>
                        {isCooldown ? `⏳ Cooldown (${info?.secundeRamase}s)` : '✅ Activ și pregătit'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </BlurView>
          </Animated.View>
        )}

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
                  <Animated.Text key={scanStepIndex} entering={FadeInUp.duration(250)} style={[styles.scanningText, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>
                    {scanSteps[scanStepIndex]}
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
          <Text style={styles.scanHint}>Încadrează farfuria clar și luminos</Text>
        </View>
      </CameraView>

      {/* Result section & sheet */}
      {rezultat.length > 0 && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View entering={FadeInUp.duration(500).springify()} style={[styles.resultSheet, { borderColor: colors.accent + '26' }]}>
            <BlurView intensity={50} tint="dark" style={[styles.resultBlur, { maxHeight: height * 0.8 }]}>
              <LinearGradient colors={[colors.accent + '10', 'rgba(0,0,0,0)']} style={[styles.resultGrad, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
                <View style={styles.resultHandle} />
                
                <View style={styles.resultSection}>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.resultTitle, { color: colors.textPrimary }]}>Ingredientele detectate</Text>

                  {/* REMED-009: categorie explicită pentru masa scanată — sugestia
                      după oră e doar valoarea implicită, utilizatorul o schimbă. */}
                  <View
                    style={styles.mealTypeRow}
                    accessibilityRole="radiogroup"
                    accessibilityLabel="Categoria mesei"
                  >
                    {MEAL_CATEGORIES.map((cat) => {
                      const selectat = tipMasaSelectat === cat.id;
                      const Icona = CATEGORIE_ICONA[cat.id];
                      return (
                        <Pressable
                          key={cat.id}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setTipMasaSelectat(cat.id);
                          }}
                          style={[
                            styles.mealTypeChip,
                            selectat && { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
                          ]}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selectat }}
                          accessibilityLabel={t(`chat.mealCategory.${cat.id}`)}
                          hitSlop={6}
                        >
                          <Icona size={14} color={selectat ? colors.accent : colors.textSecondary} />
                          <Text maxFontSizeMultiplier={1.3} style={[styles.mealTypeChipText, { color: selectat ? colors.accent : colors.textSecondary }]}>
                            {t(`chat.mealCategory.${cat.id}`)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {pozaScanPreview ? (
                    <Image
                      source={{ uri: pozaScanPreview }}
                      style={styles.scanPreviewThumb}
                      importantForAccessibility="no"
                      accessibilityElementsHidden
                    />
                  ) : null}

                  <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
                    {rezultat.map((ingredient, index) => {
                      // REMED-008: kcal per rând din gramajul curent (per-100g scalat).
                      const kcalRand = Math.round(
                        ((ingredient.calorii_per_100g || 0) * (ingredient.estimare_grame || 0)) / 100,
                      );
                      return (
                        <View key={`${ingredient.nume}-${index}`} style={styles.ingredientRow}>
                          <Text
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.3}
                            style={[styles.ingredientName, { color: colors.textPrimary }]}
                          >
                            {ingredient.nume}
                          </Text>
                          <View style={styles.kcalChip}>
                            <Text maxFontSizeMultiplier={1.3} style={[styles.kcalChipText, { color: colors.accent }]}>
                              {kcalRand} kcal
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
                            accessibilityLabel={`Șterge ${ingredient.nume} din rezultat`}
                            accessibilityHint="Elimină doar acest aliment, restul rămân"
                          >
                            <Trash2 size={16} color={colors.danger} />
                          </Pressable>
                        </View>
                      );
                    })}

                    <TouchableOpacity
                      style={[styles.addExtraBtn, { borderColor: colors.accent }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setCautareProdusVisible(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Adaugă alt produs"
                      accessibilityHint="Deschide căutarea pentru a adăuga un aliment suplimentar"
                    >
                      <Plus size={16} color={colors.accent} />
                      <Text maxFontSizeMultiplier={1.3} style={[styles.addExtraText, { color: colors.accent, fontWeight: '700' }]}>
                        + Adaugă alt produs
                      </Text>
                    </TouchableOpacity>

                    <View style={{ marginTop: 12 }}>
                      <IngredientCorrectionInput
                        ingredienteCurente={rezultat}
                        onCorectat={setRezultat}
                        onSend={sendCorrectionToAI}
                      />
                    </View>
                  </ScrollView>
                </View>

                <View style={styles.macroRow}>
                  <View style={styles.macroItem}>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.macroValue, { color: colors.accent }]}>{Math.round(totalCalculat.calorii)}</Text>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.macroLabel, { color: colors.textSecondary }]}>kcal</Text>
                  </View>
                  <View style={styles.macroDivider} />
                  <View style={styles.macroItem}>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.macroValue, { color: colors.accentSecondary }]}>{Math.round(totalCalculat.proteine)}g</Text>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.macroLabel, { color: colors.textSecondary }]}>proteine</Text>
                  </View>
                  <View style={styles.macroDivider} />
                  <View style={styles.macroItem}>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.macroValue, { color: colors.accentTertiary }]}>{Math.round(totalCalculat.carbohidrati)}g</Text>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.macroLabel, { color: colors.textSecondary }]}>carbs</Text>
                  </View>
                  <View style={styles.macroDivider} />
                  <View style={styles.macroItem}>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.macroValue, { color: colors.warning }]}>{Math.round(totalCalculat.grasimi)}g</Text>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.macroLabel, { color: colors.textSecondary }]}>grăsimi</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.addBtn, { shadowColor: colors.accent }]}
                  onPress={adaugaInJurnal}
                  accessibilityRole="button"
                  accessibilityLabel={`Adaugă cele ${Math.round(totalCalculat.calorii)} kilocalorii în jurnal`}
                  accessibilityState={{ disabled: isSavingDiary, busy: isSavingDiary }}
                >
                  <LinearGradient colors={colors.accentGradient} style={styles.addBtnGrad}>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.addBtnText, { color: colors.background }]}>+ Adaugă {Math.round(totalCalculat.calorii)} kcal în Jurnal</Text>
                  </LinearGradient>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); anuleazaScanarea(); }}
                  accessibilityRole="button"
                  accessibilityLabel="Anulează rezultatul și scanează din nou"
                >
                  <Text maxFontSizeMultiplier={1.3} style={styles.retryBtnText}>🔄 Anulează & Scanează din nou</Text>
                </TouchableOpacity>
              </LinearGradient>
            </BlurView>
          </Animated.View>
        </KeyboardAvoidingView>
      )}

      {scanError && (
        <View style={[styles.errorCard, { top: insets.top + 78 }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <Text maxFontSizeMultiplier={1.3} style={styles.errorText}>{scanError}</Text>
          <Pressable onPress={() => setScanError(null)} accessibilityRole="button" accessibilityLabel="Închide mesajul de eroare">
            <Text maxFontSizeMultiplier={1.3} style={styles.retryText}>Închide</Text>
          </Pressable>
        </View>
      )}

      {isSavingDiary && (
        <View style={styles.savingOverlay} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={colors.accent} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.savingText, { color: colors.accent }]}>Salvez în jurnal...</Text>
        </View>
      )}

      {/* Modal Căutare Produs Extra */}
      <Modal
        visible={cautareProdusVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCautareProdusVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 16 }}>
          <ProductSearch
            onSelectProductWithGrams={(prod, gr) => {
              const aliment = foodProductToAlimentAI(prod, gr);
              setRezultat(prev => [...prev, {
                nume: aliment.nume,
                estimare_grame: aliment.estimare_grame || 100,
                calorii_per_100g: aliment.calorii_per_100g || 0,
                proteine_per_100g: aliment.proteine_per_100g || 0,
                grasimi_per_100g: aliment.grasimi_per_100g || 0,
                carbohidrati_per_100g: aliment.carbohidrati_per_100g || 0,
              }]);
              setCautareProdusVisible(false);
            }}
            onClose={() => setCautareProdusVisible(false)}
          />
        </View>
      </Modal>

      {/* Shutter & Gallery button */}
      {rezultat.length === 0 && (
        <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(600).delay(200)} style={[styles.shutterArea, { bottom: Math.max(insets.bottom, 16) + 20 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 28 }}>
            <TouchableOpacity
              testID="gallery-button"
              accessibilityRole="button"
              accessibilityLabel="Alege o poză din galerie"
              accessibilityHint="Deschide galeria foto pentru a selecta o imagine"
              accessibilityState={{ disabled: seIncarca, busy: seIncarca }}
              style={[styles.galleryBtn, { borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(0,0,0,0.5)' }]}
              onPress={alegeDinGalerie}
              disabled={seIncarca}
            >
              <ImageIcon size={22} color="#FFFFFF" />
              <Text maxFontSizeMultiplier={1.3} style={styles.galleryBtnText}>Galerie</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="shutter-button"
              accessibilityRole="button"
              accessibilityLabel="Fotografiază mâncarea"
              accessibilityHint="Realizează o poză farfuriei și pornește analiza AI"
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
          <Text maxFontSizeMultiplier={1.3} style={styles.shutterLabel}>Apasă pe buton sau alege o poză din galerie</Text>
        </Animated.View>
      )}

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

  resultSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 40, borderTopRightRadius: 40, overflow: 'hidden', borderWidth: 1 },
  resultBlur: { overflow: 'hidden' },
  resultGrad: { padding: 32, paddingTop: 20 },
  resultHandle: { width: 48, height: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3, alignSelf: 'center', marginBottom: 24 },
  resultTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16, letterSpacing: -0.3 },
  resultSection: { width: '100%' },
  // REMED-008: o singură miniatură a pozei scanate deasupra listei (NU per-rând).
  scanPreviewThumb: { width: '100%', height: 140, borderRadius: 16, marginBottom: 12, resizeMode: 'cover' },

  itemsList: { maxHeight: 220, marginBottom: 20 },
  ingredientRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  ingredientName: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8, paddingVertical: 4 },
  // REMED-008: chip kcal per rând (gramaj scalat).
  kcalChip: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kcalChipText: { fontSize: FontSize.caption, fontWeight: '800' },
  // REMED-009: selectoare explicite de categorie a mesei scanate.
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
  addExtraBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, marginTop: 4, gap: 6, borderWidth: 1, borderRadius: 14 },
  addExtraText: { fontSize: 14, fontWeight: '600' },

  macroRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  macroItem: { flex: 1, alignItems: 'center' },
  macroValue: { fontSize: 22, fontWeight: '900', marginBottom: 4 },
  macroLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  macroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  addBtn: { borderRadius: 20, overflow: 'hidden', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 10 },
  addBtnGrad: { padding: 20, alignItems: 'center' },
  addBtnText: { fontSize: 17, fontWeight: '900', letterSpacing: 0.5 },
  retryBtn: { padding: 16, alignItems: 'center', marginTop: 12, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.08)' },
  retryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  errorCard: { position: 'absolute', top: 120, left: 20, right: 20, backgroundColor: 'rgba(239,68,68,0.9)', padding: 16, borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 999 },
  errorText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14, flex: 1, marginRight: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, textDecorationLine: 'underline' },

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
