import {
  createNotificationResponseDispatcher,
  getNotificationResponseKey,
  resolveNotificationDestination,
  subscribeToNotificationResponses,
  type NotificationResponseLike,
} from '../lib/notificationNavigation';

describe('notificationStartupGuard', () => {
  describe('getNotificationResponseKey', () => {
    it('generates consistent key for same response', () => {
      const response: NotificationResponseLike = {
        actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
        notification: {
          date: 1730390400000,
          request: {
            identifier: 'meal-reminder-lunch-123',
            content: { data: { route: '/(tabs)' } },
          },
        },
      };

      const key1 = getNotificationResponseKey(response);
      const key2 = getNotificationResponseKey(response);

      expect(key1).toBeTruthy();
      expect(key1).toBe(key2);
      expect(JSON.parse(key1!)).toEqual([
        'meal-reminder-lunch-123',
        1730390400000,
        'expo.modules.notifications.actions.DEFAULT',
      ]);
    });

    it('returns null if identifier is missing', () => {
      const response: NotificationResponseLike = {
        notification: {
          request: {
            content: {},
          },
        },
      };
      expect(getNotificationResponseKey(response)).toBeNull();
    });
  });

  describe('createNotificationResponseDispatcher', () => {
    it('dispatches a new notification and saves its key', async () => {
      const savedKeys: string[][] = [];
      const navigated: [string, NotificationResponseLike][] = [];

      const dispatch = createNotificationResponseDispatcher({
        loadHandledKeys: async () => [],
        saveHandledKeys: async (keys) => {
          savedKeys.push(keys);
        },
        getLastResponse: () => null,
        clearLastResponse: jest.fn(),
        navigate: (destination, response) => {
          navigated.push([destination, response]);
        },
      });

      const response: NotificationResponseLike = {
        notification: {
          date: 1000,
          request: {
            identifier: 'notif-1',
            content: { data: { route: '/(tabs)/istoric' } },
          },
        },
      };

      const handled = await dispatch(response);

      expect(handled).toBe(true);
      expect(navigated).toHaveLength(1);
      expect(navigated[0][0]).toBe('/(tabs)/istoric');
      expect(savedKeys).toHaveLength(1);
      expect(savedKeys[0]).toContain(getNotificationResponseKey(response));
    });

    it('deduplicates cold-start replayed response and does NOT navigate twice', async () => {
      const navigated: string[] = [];
      const clearLastResponse = jest.fn();

      const response: NotificationResponseLike = {
        actionIdentifier: 'default',
        notification: {
          date: 2000,
          request: {
            identifier: 'replayed-intent-id',
            content: { data: { route: '/(tabs)/statistici' } },
          },
        },
      };

      const dispatch = createNotificationResponseDispatcher({
        loadHandledKeys: async () => [],
        saveHandledKeys: async () => {},
        getLastResponse: () => response,
        clearLastResponse,
        navigate: (dest) => {
          navigated.push(dest);
        },
      });

      // Prima livrare (tap real sau prima procesare)
      const firstHandled = await dispatch(response);
      expect(firstHandled).toBe(true);
      expect(navigated).toEqual(['/(tabs)/statistici']);

      // A doua livrare (re-emisie de Activity / cold-start intent)
      const secondHandled = await dispatch(response);
      expect(secondHandled).toBe(false);
      // Destinatia nu a fost apelata a doua oara
      expect(navigated).toEqual(['/(tabs)/statistici']);
      expect(clearLastResponse).toHaveBeenCalled();
    });

    it('ignores notifications already stored in persistence', async () => {
      const navigated: string[] = [];

      const existingResponse: NotificationResponseLike = {
        actionIdentifier: 'default',
        notification: {
          date: 3000,
          request: {
            identifier: 'persisted-notification-id',
            content: { data: { route: '/(tabs)/chat' } },
          },
        },
      };

      const existingKey = getNotificationResponseKey(existingResponse)!;

      const dispatch = createNotificationResponseDispatcher({
        loadHandledKeys: async () => [existingKey],
        saveHandledKeys: async () => {},
        getLastResponse: () => null,
        clearLastResponse: jest.fn(),
        navigate: (dest) => {
          navigated.push(dest);
        },
      });

      const handled = await dispatch(existingResponse);
      expect(handled).toBe(false);
      expect(navigated).toHaveLength(0);
    });

    it('prevents navigation to /notificari for reminders without data.route at startup', async () => {
      const routerPush = jest.fn();
      let explicitNotificationTap = false;

      // Logica de navigate conform app/_layout.tsx
      const navigateHandler = (destination: string, response: NotificationResponseLike) => {
        const rawData = response?.notification?.request?.content?.data as Record<string, unknown> | undefined;
        if (!rawData?.route || destination === '/' || destination === '/(tabs)' || destination === '/notificari') {
          return;
        }
        explicitNotificationTap = true;
        routerPush(destination);
      };

      const dispatch = createNotificationResponseDispatcher({
        loadHandledKeys: async () => [],
        saveHandledKeys: async () => {},
        getLastResponse: () => null,
        clearLastResponse: jest.fn(),
        navigate: navigateHandler,
      });

      // Notificare veche fără data.route (sau cu data lipsă)
      const mealReminderNoRoute: NotificationResponseLike = {
        notification: {
          date: 4000,
          request: {
            identifier: 'legacy-meal-reminder-lunch',
            content: {}, // Fara data.route
          },
        },
      };

      // Desi resolveNotificationDestination returneaza '/notificari' ca fallback generic:
      expect(resolveNotificationDestination(mealReminderNoRoute.notification?.request?.content?.data)).toBe('/notificari');

      // Dispatcherul cu guardul din app/_layout.tsx blocheaza redirectul:
      const handled = await dispatch(mealReminderNoRoute);
      expect(handled).toBe(true); // Cheia a fost marcata pentru deduplicare
      expect(routerPush).not.toHaveBeenCalled(); // NICIODATA push la /notificari
      expect(explicitNotificationTap).toBe(false);
    });

    it('prevents navigation to /notificari for meal reminder with route /(tabs)', async () => {
      const routerPush = jest.fn();
      let explicitNotificationTap = false;

      const navigateHandler = (destination: string, response: NotificationResponseLike) => {
        const rawData = response?.notification?.request?.content?.data as Record<string, unknown> | undefined;
        if (!rawData?.route || destination === '/' || destination === '/(tabs)' || destination === '/notificari') {
          return;
        }
        explicitNotificationTap = true;
        routerPush(destination);
      };

      const dispatch = createNotificationResponseDispatcher({
        loadHandledKeys: async () => [],
        saveHandledKeys: async () => {},
        getLastResponse: () => null,
        clearLastResponse: jest.fn(),
        navigate: navigateHandler,
      });

      const newMealReminder: NotificationResponseLike = {
        notification: {
          date: 5000,
          request: {
            identifier: 'new-meal-reminder-dinner',
            content: { data: { route: '/(tabs)' } },
          },
        },
      };

      const handled = await dispatch(newMealReminder);
      expect(handled).toBe(true);
      expect(routerPush).not.toHaveBeenCalled();
      expect(explicitNotificationTap).toBe(false);
    });

    it('allows valid deep-link navigation like /(tabs)/antrenamente', async () => {
      const routerPush = jest.fn();
      let explicitNotificationTap = false;

      const navigateHandler = (destination: string, response: NotificationResponseLike) => {
        const rawData = response?.notification?.request?.content?.data as Record<string, unknown> | undefined;
        if (!rawData?.route || destination === '/' || destination === '/(tabs)' || destination === '/notificari') {
          return;
        }
        explicitNotificationTap = true;
        routerPush(destination);
      };

      const dispatch = createNotificationResponseDispatcher({
        loadHandledKeys: async () => [],
        saveHandledKeys: async () => {},
        getLastResponse: () => null,
        clearLastResponse: jest.fn(),
        navigate: navigateHandler,
      });

      const deepLinkNotification: NotificationResponseLike = {
        notification: {
          date: 6000,
          request: {
            identifier: 'workout-reminder',
            content: { data: { route: '/(tabs)/antrenamente' } },
          },
        },
      };

      const handled = await dispatch(deepLinkNotification);
      expect(handled).toBe(true);
      expect(routerPush).toHaveBeenCalledWith('/(tabs)/antrenamente');
      expect(explicitNotificationTap).toBe(true);
    });

    it('blocks explicit navigation if notification data specifies route /notificari', async () => {
      const routerPush = jest.fn();
      let explicitNotificationTap = false;

      const navigateHandler = (destination: string, response: NotificationResponseLike) => {
        const rawData = response?.notification?.request?.content?.data as Record<string, unknown> | undefined;
        if (!rawData?.route || destination === '/' || destination === '/(tabs)' || destination === '/notificari') {
          return;
        }
        explicitNotificationTap = true;
        routerPush(destination);
      };

      const dispatch = createNotificationResponseDispatcher({
        loadHandledKeys: async () => [],
        saveHandledKeys: async () => {},
        getLastResponse: () => null,
        clearLastResponse: jest.fn(),
        navigate: navigateHandler,
      });

      const notifPointingToNotificari: NotificationResponseLike = {
        notification: {
          date: 7000,
          request: {
            identifier: 'notif-pointing-to-inbox',
            content: { data: { route: '/notificari' } },
          },
        },
      };

      const handled = await dispatch(notifPointingToNotificari);
      expect(handled).toBe(true);
      expect(routerPush).not.toHaveBeenCalled();
      expect(explicitNotificationTap).toBe(false);
    });
  });

  describe('subscribeToNotificationResponses', () => {
    it('properly connects listener and removes subscription on cleanup', () => {
      const mockRemove = jest.fn();
      let capturedListener: ((resp: NotificationResponseLike) => void) | null = null;

      const subscribe = (listener: (resp: NotificationResponseLike) => void) => {
        capturedListener = listener;
        return { remove: mockRemove };
      };

      const dispatch = jest.fn().mockResolvedValue(true);
      const unsubscribe = subscribeToNotificationResponses(subscribe, dispatch);

      expect(capturedListener).toBeDefined();

      const fakeResponse: NotificationResponseLike = {
        notification: {
          request: { identifier: 'sub-test-1' },
        },
      };

      capturedListener!(fakeResponse);
      expect(dispatch).toHaveBeenCalledWith(fakeResponse);

      unsubscribe();
      expect(mockRemove).toHaveBeenCalled();
    });
  });
});

