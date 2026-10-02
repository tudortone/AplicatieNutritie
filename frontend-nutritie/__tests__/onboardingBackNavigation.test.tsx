import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Text, TouchableOpacity, BackHandler, Platform, View } from 'react-native';
import { render, fireEvent, waitFor, within, cleanup, act } from '@testing-library/react-native';
import EcranPas from '../components/onboarding/EcranPas';
import { anuleazaProtectieNavigare } from '../lib/onboardingNavigationGuard';

jest.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key === 'onboarding.back' ? 'Înapoi' : key,
		i18n: { language: 'ro', isInitialized: true },
	}),
}));

type NavigationContextType = {
  stack: string[];
  push: (route: string) => void;
  back: () => void;
  canGoBack: () => boolean;
  currentRoute: string;
};

const mockNavigationContext = createContext<NavigationContextType | null>(null);
const mockFocusContext = createContext<{ isFocused: boolean }>({ isFocused: true });

const mockFallbackPush = jest.fn();
const mockFallbackBack = jest.fn();
const mockFallbackCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => {
      const nav = React.useContext(mockNavigationContext);
      return React.useMemo(() => {
        if (!nav) {
          return {
            push: mockFallbackPush,
            back: mockFallbackBack,
            canGoBack: mockFallbackCanGoBack,
            replace: mockFallbackPush,
          };
        }
        return {
          push: nav.push,
          back: nav.back,
          canGoBack: nav.canGoBack,
          replace: nav.push,
        };
      }, [nav?.push, nav?.back, nav?.canGoBack]);
    },
    // Realist: reproduce comportamentul @react-navigation/core useFocusEffect
    // Rularea depinde de [isFocused, effect] - schimbarea identității callback-ului
    // în timp ce ecranul este focalizat curăță efectul anterior și re-execută efectul nou!
    useFocusEffect: (effect: () => (() => void) | void) => {
      const { isFocused } = React.useContext(mockFocusContext);
      React.useEffect(() => {
        if (!isFocused) return;
        const cleanupFn = effect();
        return () => {
          if (typeof cleanupFn === 'function') {
            cleanupFn();
          }
        };
      }, [isFocused, effect]);
    },
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#090C0E',
      textPrimary: '#FFFFFF',
      textSecondary: '#8B93A0',
      accent: '#CCFF00',
      accentGradient: ['#CCFF00', '#A8FF3E'],
      overlayStrong: 'rgba(255,255,255,0.08)',
    },
  }),
}));

const mockOnboardingDate = {
  scop: 'slabire',
  gen: 'masculin',
};

jest.mock('../context/OnboardingContext', () => ({
  useOnboarding: () => ({
    date: mockOnboardingDate,
    actualizeaza: jest.fn(),
  }),
}));

// Realist navigation stack harness
function NavigationHarness({
  initialRoute = '/onboarding/scop',
  routes,
  onStackChange,
  onPush,
}: {
  initialRoute?: string;
  routes: Record<string, React.ComponentType<{ route: string }>>;
  onStackChange?: (stack: string[]) => void;
  onPush?: (route: string) => void;
}) {
  const [stack, setStack] = useState<string[]>([initialRoute]);

  const push = useCallback(
    (route: string) => {
      if (onPush) {
        onPush(route);
      }
      setStack((prev) => {
        const next = [...prev, route];
        onStackChange?.(next);
        return next;
      });
    },
    [onPush, onStackChange]
  );

  const back = useCallback(() => {
    setStack((prev) => {
      const next = prev.length > 1 ? prev.slice(0, prev.length - 1) : prev;
      onStackChange?.(next);
      return next;
    });
  }, [onStackChange]);

  const canGoBack = useCallback(() => stack.length > 1, [stack.length]);

  const navValue = React.useMemo<NavigationContextType>(
    () => ({
      stack,
      push,
      back,
      canGoBack,
      currentRoute: stack[stack.length - 1],
    }),
    [stack, push, back, canGoBack]
  );

  return (
    <mockNavigationContext.Provider value={navValue}>
      <View testID="nav-harness-root">
        {stack.map((route, index) => {
          const isFocused = index === stack.length - 1;
          const Component = routes[route];
          if (!Component) return null;
          return (
            <mockFocusContext.Provider key={route} value={{ isFocused }}>
              <View testID={`screen-container-${route}`}>
                <Component route={route} />
              </View>
            </mockFocusContext.Provider>
          );
        })}
      </View>
    </mockNavigationContext.Provider>
  );
}

describe('P0-01 — Onboarding navigation state survives Back regression tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    anuleazaProtectieNavigare();
  });

  afterEach(async () => {
    cleanup();
    anuleazaProtectieNavigare();
  });

  // TEST A: Real navigation cycle: Continue -> next route -> previous loses focus -> Back -> previous receives focus -> previous enabled -> Continue works again
  it('TEST A: Continue -> next route -> Back -> previous screen re-enables and Continue works again', async () => {
    function Step1() {
      return (
        <EcranPas
          pas="/onboarding/scop"
          titlu="Pasul 1: Obiectiv"
          poateContinua={true}
          etichetaButon="Continuă Pas 1"
        >
          <Text>Continut Pas 1</Text>
        </EcranPas>
      );
    }

    function Step2() {
      return (
        <EcranPas
          pas="/onboarding/greutate-tinta"
          titlu="Pasul 2: Greutate"
          poateContinua={true}
          etichetaButon="Continuă Pas 2"
        >
          <Text>Continut Pas 2</Text>
        </EcranPas>
      );
    }

    const routes = {
      '/onboarding/scop': Step1,
      '/onboarding/greutate-tinta': Step2,
    };

    const view = await render(<NavigationHarness initialRoute="/onboarding/scop" routes={routes} />);

    // Step 1 is visible and enabled
    const step1Container = view.getByTestId('screen-container-/onboarding/scop');
    const continueBtn1 = within(step1Container).getByRole('button', { name: 'Continuă Pas 1' });
    expect(continueBtn1.props.accessibilityState.disabled).toBe(false);

    // 1. Apasă Continuă pe Step 1
    await fireEvent.press(continueBtn1);

    // 2. Step 2 devine activ în stivă
    await waitFor(() => {
      expect(view.getByText('Pasul 2: Greutate')).toBeTruthy();
    });

    // Step 1 este încă montat în stivă, dar nu mai are focus
    const step2Container = view.getByTestId('screen-container-/onboarding/greutate-tinta');
    const backBtn = within(step2Container).getByRole('button', { name: 'Înapoi' });
    expect(backBtn).toBeTruthy();

    // 3. Apasă Înapoi pe Step 2
    await fireEvent.press(backBtn);

    // 4. Step 2 s-a demontat, Step 1 reprimește focus
    await waitFor(() => {
      expect(view.queryByText('Pasul 2: Greutate')).toBeNull();
    });

    // Step 1 trebuie să aibă butonul de Continuă deblocat și activ
    await waitFor(() => {
      const refreshedBtn1 = within(step1Container).getByRole('button', { name: 'Continuă Pas 1' });
      expect(refreshedBtn1.props.accessibilityState.disabled).toBe(false);
      expect(refreshedBtn1.props.accessibilityState.busy).toBe(false);
    });

    // 5. Utilizatorul poate apăsa Continuă din nou din Step 1
    const refreshedBtn1 = within(step1Container).getByRole('button', { name: 'Continuă Pas 1' });
    await fireEvent.press(refreshedBtn1);

    // Step 2 se deschide din nou
    await waitFor(() => {
      expect(view.getByText('Pasul 2: Greutate')).toBeTruthy();
    });
  });

  // TEST B: Rapid Continue double-tap -> exactly one navigation transition
  it('TEST B: rapid double-tap on Continue triggers only one navigation transition', async () => {
    let pushCount = 0;
    function Step1() {
      return (
        <EcranPas
          pas="/onboarding/scop"
          titlu="Pasul 1: Obiectiv"
          poateContinua={true}
          etichetaButon="Continuă"
        >
          <Text>Continut</Text>
        </EcranPas>
      );
    }

    const routes = {
      '/onboarding/scop': Step1,
      '/onboarding/greutate-tinta': () => <Text>Pas 2</Text>,
    };

    const view = await render(
      <NavigationHarness
        initialRoute="/onboarding/scop"
        routes={routes}
        onStackChange={(stack) => {
          pushCount = stack.length - 1;
        }}
      />
    );

    const continueBtn = view.getByRole('button', { name: 'Continuă' });

    // Două apăsări rapide consecutive în cadrul ferestrei de gardă
    await fireEvent.press(continueBtn);
    await fireEvent.press(continueBtn);

    await waitFor(() => {
      expect(view.getByText('Pas 2')).toBeTruthy();
    });

    // S-a făcut exact o tranziție
    expect(pushCount).toBe(1);
  });

  // TEST C: laContinuare() resolves/returns false -> submission lock is released -> Continue is usable again
  it('TEST C: laContinuare returning false releases submission lock and allows retry', async () => {
    let returnFalseOnce = true;
    const laContinuareMock = jest.fn(async () => {
      if (returnFalseOnce) {
        returnFalseOnce = false;
        return false;
      }
      return true;
    });

    function Step1() {
      return (
        <EcranPas
          pas="/onboarding/scop"
          titlu="Pasul 1"
          poateContinua={true}
          laContinuare={laContinuareMock}
          etichetaButon="Continuă"
        >
          <Text>Continut</Text>
        </EcranPas>
      );
    }

    const routes = {
      '/onboarding/scop': Step1,
      '/onboarding/greutate-tinta': () => <Text>Pas 2</Text>,
    };

    const view = await render(<NavigationHarness initialRoute="/onboarding/scop" routes={routes} />);

    const continueBtn = view.getByRole('button', { name: 'Continuă' });

    // Prima apăsare: laContinuare returnează false
    await fireEvent.press(continueBtn);

    await waitFor(() => {
      expect(laContinuareMock).toHaveBeenCalledTimes(1);
    });

    // Pasul 2 NU a fost deschis
    expect(view.queryByText('Pas 2')).toBeNull();

    // Butonul trebuie să fie re-activat imediat (lock eliberat)
    await waitFor(() => {
      expect(continueBtn.props.accessibilityState.disabled).toBe(false);
      expect(continueBtn.props.accessibilityState.busy).toBe(false);
    });

    // A doua apăsare: laContinuare returnează true
    await fireEvent.press(continueBtn);

    await waitFor(() => {
      expect(laContinuareMock).toHaveBeenCalledTimes(2);
      expect(view.getByText('Pas 2')).toBeTruthy();
    });
  });

  // TEST D: laContinuare failure releases lock and re-enables controls (action failure)
  it('TEST D: laContinuare failure releases lock and re-enables controls', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let failFirst = true;
    const laContinuareMock = jest.fn(async () => {
      if (failFirst) {
        failFirst = false;
        throw new Error('Eroare validare laContinuare');
      }
      return true;
    });

    function Step1() {
      return (
        <EcranPas
          pas="/onboarding/scop"
          titlu="Pasul 1"
          poateContinua={true}
          laContinuare={laContinuareMock}
          etichetaButon="Continuă"
        >
          <Text>Continut</Text>
        </EcranPas>
      );
    }

    const routes = {
      '/onboarding/scop': Step1,
      '/onboarding/greutate-tinta': () => <Text>Pas 2</Text>,
    };

    const view = await render(<NavigationHarness initialRoute="/onboarding/scop" routes={routes} />);

    const continueBtn = view.getByRole('button', { name: 'Continuă' });

    // Prima apăsare aruncă eroare
    await fireEvent.press(continueBtn);

    await waitFor(() => {
      expect(laContinuareMock).toHaveBeenCalledTimes(1);
    });

    // Controalele trebuie re-activate, fără spinner blocat
    await waitFor(() => {
      expect(continueBtn.props.accessibilityState.disabled).toBe(false);
      expect(continueBtn.props.accessibilityState.busy).toBe(false);
    });

    // Reîncercarea reușește
    await fireEvent.press(continueBtn);

    await waitFor(() => {
      expect(laContinuareMock).toHaveBeenCalledTimes(2);
      expect(view.getByText('Pas 2')).toBeTruthy();
    });

    consoleErrorSpy.mockRestore();
  });

  // TEST E: REAL ROUTER FAILURE (router.push throws synchronously -> lock clears -> retry succeeds)
  it('TEST E: router.push throwing releases locks and allows successful retry without stuck spinner', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrowOnPush = true;
    let pushCount = 0;

    function Step1() {
      return (
        <EcranPas
          pas="/onboarding/scop"
          titlu="Pasul 1"
          poateContinua={true}
          etichetaButon="Continuă"
        >
          <Text>Continut</Text>
        </EcranPas>
      );
    }

    const routes = {
      '/onboarding/scop': Step1,
      '/onboarding/greutate-tinta': () => <Text>Pas 2</Text>,
    };

    const view = await render(
      <NavigationHarness
        initialRoute="/onboarding/scop"
        routes={routes}
        onPush={(route) => {
          if (shouldThrowOnPush) {
            shouldThrowOnPush = false;
            throw new Error('Router push failure (network/navigation error)');
          }
          pushCount++;
        }}
      />
    );

    const continueBtn = view.getByRole('button', { name: 'Continuă' });

    // Prima apăsare: router.push aruncă eroare
    await fireEvent.press(continueBtn);

    // Ecranul curent rămâne vizibil
    expect(view.queryByText('Pas 2')).toBeNull();
    expect(view.getByText('Pasul 1')).toBeTruthy();

    // Controalele trebuie re-activate fără spinner blocat
    await waitFor(() => {
      expect(continueBtn.props.accessibilityState.disabled).toBe(false);
      expect(continueBtn.props.accessibilityState.busy).toBe(false);
    });

    // A doua apăsare: reîncercarea reușește
    await fireEvent.press(continueBtn);

    await waitFor(() => {
      expect(view.getByText('Pas 2')).toBeTruthy();
    });

    expect(pushCount).toBe(1);
    consoleErrorSpy.mockRestore();
  });

  // TEST F: Form state survives navigation cycle (enter value -> Continue -> Back -> value intact)
  it('TEST F: form values inside step survive navigation forward and Back', async () => {
    function StepWithForm() {
      const [greutate, setGreutate] = useState('75');
      return (
        <EcranPas
          pas="/onboarding/scop"
          titlu="Formular Greutate"
          poateContinua={true}
          etichetaButon="Continuă"
        >
          <Text testID="valoare-greutate">{greutate}</Text>
          <TouchableOpacity testID="btn-schimba-greutate" onPress={() => setGreutate('82')}>
            <Text>Setează 82</Text>
          </TouchableOpacity>
        </EcranPas>
      );
    }

    function NextStep() {
      return (
        <EcranPas
          pas="/onboarding/greutate-tinta"
          titlu="Pas Următor"
          poateContinua={true}
          etichetaButon="Finalizează"
        >
          <Text>Continut Pas Urmator</Text>
        </EcranPas>
      );
    }

    const routes = {
      '/onboarding/scop': StepWithForm,
      '/onboarding/greutate-tinta': NextStep,
    };

    const view = await render(<NavigationHarness initialRoute="/onboarding/scop" routes={routes} />);

    const stepFormContainer = view.getByTestId('screen-container-/onboarding/scop');
    expect(within(stepFormContainer).getByTestId('valoare-greutate').props.children).toBe('75');

    // 1. Utilizatorul modifică valoarea formularului
    await fireEvent.press(within(stepFormContainer).getByTestId('btn-schimba-greutate'));
    await waitFor(() => {
      expect(within(stepFormContainer).getByTestId('valoare-greutate').props.children).toBe('82');
    });

    // 2. Apasă Continuă -> ecranul următor se montează
    await fireEvent.press(within(stepFormContainer).getByRole('button', { name: 'Continuă' }));

    await waitFor(() => {
      expect(view.getByText('Pas Următor')).toBeTruthy();
    });

    const nextStepContainer = view.getByTestId('screen-container-/onboarding/greutate-tinta');
    // 3. Apasă Înapoi -> revine la ecranul cu formular
    await fireEvent.press(within(nextStepContainer).getByRole('button', { name: 'Înapoi' }));

    await waitFor(() => {
      expect(view.queryByText('Pas Următor')).toBeNull();
    });

    // 4. Valoarea formularului (82) a supraviețuit intactă
    expect(within(stepFormContainer).getByTestId('valoare-greutate').props.children).toBe('82');
    const continueBtn = within(stepFormContainer).getByRole('button', { name: 'Continuă' });
    expect(continueBtn.props.accessibilityState.disabled).toBe(false);
  });

  // TEST G & H: FOCUS-SCOPED HARDWARE BACK & BLUR CLEANUP
  // Cu două ecrane de onboarding montate în stivă, doar ecranul focalizat deține un listener hardware Back activ.
  // Ecranul pierzător de focus (blurred) trebuie să își elimine listener-ul.
  it('TEST G & H: Android hardware Back listener exists ONLY while route is focused and is removed on blur', async () => {
    // Simulăm Platform.OS = android
    const originalPlatform = Platform.OS;
    Platform.OS = 'android';

    const activeListeners = new Set<() => boolean | null | undefined>();
    const addEventListenerSpy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(
      (event: 'hardwareBackPress', handler: () => boolean | null | undefined) => {
        if (event === 'hardwareBackPress') {
          activeListeners.add(handler);
        }
        return {
          remove: () => {
            activeListeners.delete(handler);
          },
        } as any;
      }
    );

    try {
      function Step1() {
        return (
          <EcranPas
            pas="/onboarding/scop"
            titlu="Pasul 1"
            poateContinua={true}
            etichetaButon="Continuă Pas 1"
          >
            <Text>Continut 1</Text>
          </EcranPas>
        );
      }

      function Step2() {
        return (
          <EcranPas
            pas="/onboarding/greutate-tinta"
            titlu="Pasul 2"
            poateContinua={true}
            etichetaButon="Continuă Pas 2"
          >
            <Text>Continut 2</Text>
          </EcranPas>
        );
      }

      const routes = {
        '/onboarding/scop': Step1,
        '/onboarding/greutate-tinta': Step2,
      };

      const view = await render(<NavigationHarness initialRoute="/onboarding/scop" routes={routes} />);

      // TEST G: Doar Step 1 este montat și focalizat
      expect(activeListeners.size).toBe(1);

      // TEST H: Navigăm la Step 2: Step 1 rămâne montat, dar devine BLURRED
      const step1Container = view.getByTestId('screen-container-/onboarding/scop');
      await fireEvent.press(within(step1Container).getByRole('button', { name: 'Continuă Pas 1' }));

      await waitFor(() => {
        expect(view.getByText('Pasul 2')).toBeTruthy();
      });

      // Step 1 și-a curățat listener-ul la blur; doar Step 2 deține listener activ
      expect(activeListeners.size).toBe(1);

      // Revenim cu Back la Step 1: Step 2 este demontat, Step 1 redevine FOCUSED
      const step2Container = view.getByTestId('screen-container-/onboarding/greutate-tinta');
      await fireEvent.press(within(step2Container).getByRole('button', { name: 'Înapoi' }));

      await waitFor(() => {
        expect(view.queryByText('Pasul 2')).toBeNull();
      });

      // Step 2 și-a eliminat listener-ul, Step 1 a reînregistrat listener-ul fresh
      expect(activeListeners.size).toBe(1);

      // La demontarea completă, niciun listener nu trebuie să rămână activ
      view.unmount();
      await waitFor(() => {
        expect(activeListeners.size).toBe(0);
      });
    } finally {
      addEventListenerSpy.mockRestore();
      Platform.OS = originalPlatform;
    }
  });

  // TEST I: SAME-FOCUS RERENDER STABILITY (BLOCKER 1)
  // Rerender-ul cauzat de starea de busy (setApasareInCurs(true)) în timp ce ecranul rămâne focalizat
  // NU trebuie să schimbe identitatea callback-ului useFocusEffect, NU trebuie să declanșeze cleanup,
  // NU trebuie să re-înregistreze BackHandler (subscription churn = 0), și NU trebuie să reseteze
  // lock-ul de navigare în timp ce o acțiune laContinuare() este în curs de desfășurare.
  it('TEST I: same-focus busy rerender does NOT churn BackHandler subscription or release in-flight lock', async () => {
    const originalPlatform = Platform.OS;
    Platform.OS = 'android';

    let addCount = 0;
    let removeCount = 0;
    const activeListeners = new Set<() => boolean | null | undefined>();

    const addEventListenerSpy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(
      (event: 'hardwareBackPress', handler: () => boolean | null | undefined) => {
        if (event === 'hardwareBackPress') {
          addCount++;
          activeListeners.add(handler);
        }
        return {
          remove: () => {
            removeCount++;
            activeListeners.delete(handler);
          },
        } as any;
      }
    );

    try {
      let resolveDeferred: (val: boolean) => void = () => {};
      const deferredPromise = new Promise<boolean>((resolve) => {
        resolveDeferred = resolve;
      });
      const laContinuareMock = jest.fn(() => deferredPromise);
      let pushCount = 0;

      function Step1() {
        return (
          <EcranPas
            pas="/onboarding/scop"
            titlu="Pasul 1"
            poateContinua={true}
            laContinuare={laContinuareMock}
            etichetaButon="Continuă"
          >
            <Text>Continut</Text>
          </EcranPas>
        );
      }

      const routes = {
        '/onboarding/scop': Step1,
        '/onboarding/greutate-tinta': () => <Text>Pas 2</Text>,
      };

      const view = await render(
        <NavigationHarness
          initialRoute="/onboarding/scop"
          routes={routes}
          onStackChange={(stack) => {
            pushCount = stack.length - 1;
          }}
        />
      );

      // 1. La montare inițială: BackHandler înregistrat exact 1 dată
      expect(addCount).toBe(1);
      expect(removeCount).toBe(0);
      expect(activeListeners.size).toBe(1);

      const continueBtn = view.getByRole('button', { name: 'Continuă' });

      // 2. Apăsăm Continuă o singură dată
      // laContinuare este declanșat, dar rămâne PENDING
      fireEvent.press(continueBtn);

      // 3. Verificăm că laContinuare a fost apelat
      await waitFor(() => {
        expect(laContinuareMock).toHaveBeenCalledTimes(1);
      });

      // 4. Starea busy a cauzat un rerender al componentei în timp ce ecranul este ÎNCĂ focalizat.
      // BLOCKER 1 VERIFICARE:
      // Dacă pasi / handleBack / useFocusEffect nu sunt stabile referențial:
      // - useFocusEffect a rulat cleanup (removeCount > 0)
      // - useFocusEffect a rulat re-entry (addCount > 1)
      // - lock-ul a fost resetat prematur!
      // Când sunt stabile referențial:
      expect(removeCount).toBe(0);
      expect(addCount).toBe(1);
      expect(activeListeners.size).toBe(1);

      // Butonul trebuie să rămână blocat (disabled/busy)
      expect(continueBtn.props.accessibilityState.disabled).toBe(true);
      expect(continueBtn.props.accessibilityState.busy).toBe(true);

      // 5. Încercăm o a doua apăsare pe Continuă în timp ce prima promisiune este încă în zbor
      fireEvent.press(continueBtn);

      // laContinuare NU trebuie apelat a doua oară
      expect(laContinuareMock).toHaveBeenCalledTimes(1);
      // Nicio navigare nu trebuie să se fi produs încă
      expect(pushCount).toBe(0);

      // 6. Rezolvăm promisiunea deferred
      await act(async () => {
        resolveDeferred(true);
      });

      // 7. Navigarea la Pas 2 se finalizează cu succes o singură dată
      await waitFor(() => {
        expect(view.getByText('Pas 2')).toBeTruthy();
      });

      expect(pushCount).toBe(1);
    } finally {
      addEventListenerSpy.mockRestore();
      Platform.OS = originalPlatform;
    }
  });
});
