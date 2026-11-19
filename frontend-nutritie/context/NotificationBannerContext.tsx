import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import InAppNotification from '../components/InAppNotification';
import * as AuthContextModule from './AuthContext';

const useAuthSafe =
  typeof AuthContextModule.useOptionalAuth === 'function'
    ? AuthContextModule.useOptionalAuth
    : AuthContextModule.useAuth;

export type NotificationType = 'success' | 'info' | 'warning' | 'error' | 'reward' | 'reminder';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  icon?: string;
  createdAt: string;
  read: boolean;
  actionLabel?: string;
  actionRoute?: string;
}

export interface BannerOptions {
  title: string;
  message?: string;
  type?: NotificationType;
  duration?: number;
  actionLabel?: string;
  actionRoute?: string;
  icon?: string;
}

interface NotificationBannerContextType {
  showNotification: (options: BannerOptions) => void;
  showBanner: (options: BannerOptions) => void;
  hideBanner: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => Promise<void>;
  clearAll: () => Promise<void>;
}

const NOTIFICATIONS_STORAGE_KEY = 'notificari_v1';
const MAX_NOTIFICATIONS = 50;

function notificationsKeyForUser(userId: string): string {
  return `${NOTIFICATIONS_STORAGE_KEY}_${userId}`;
}

// BUG-024: contextul e împărțit pe două — acțiunile (stabile, useCallback) și
// datele (notifications/unreadCount, volatile). Consumatorii care apelează doar
// showNotification/showBanner nu mai re-renderizează la fiecare notificare nouă.
export type NotificationBannerActions = Pick<
  NotificationBannerContextType,
  'showNotification' | 'showBanner' | 'hideBanner' | 'markAllRead' | 'clearAll'
>;
export type NotificationBannerData = Pick<NotificationBannerContextType, 'notifications' | 'unreadCount'>;

const NotificationBannerActionsContext = createContext<NotificationBannerActions>({
  showNotification: () => {},
  showBanner: () => {},
  hideBanner: () => {},
  markAllRead: async () => {},
  clearAll: async () => {},
});

const NotificationBannerDataContext = createContext<NotificationBannerData>({
  notifications: [],
  unreadCount: 0,
});

export function useNotificationBannerActions(): NotificationBannerActions {
  return useContext(NotificationBannerActionsContext);
}

export function useNotificationBannerData(): NotificationBannerData {
  return useContext(NotificationBannerDataContext);
}

// Hook combinat pentru compatibilitate: ecranele care citesc ȘI date ȘI acțiuni
// (ex: ecranul de notificări) îl folosesc fără schimbare.
export function useNotificationBanner(): NotificationBannerContextType {
  return { ...useNotificationBannerActions(), ...useNotificationBannerData() };
}

export function NotificationBannerProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuthSafe();
  const authUserId = auth?.user?.id ?? auth?.session?.user?.id ?? null;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [bannerState, setBannerState] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    type: NotificationType;
    actionLabel?: string;
    actionRoute?: string;
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  const timeoutRef = useRef<any>(null);
  const mountedRef = useRef(true);
  // BUG-008: oglinda sincronă a listei pentru updateri puri — calculele se fac
  // din ref (mereu la zi, chiar între două render-uri), nu din closure învechit.
  const notificationsRef = useRef(notifications);
  const activeUserIdRef = useRef<string | null>(authUserId);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const hideBanner = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setBannerState((prev) => ({ ...prev, visible: false }));
  }, []);

  // Încarcă istoricul notificărilor din AsyncStorage cu izolare strictă per cont
  // (P0-12: consumă useAuth().user?.id, fără subscripție onAuthStateChange redundantă)
  useEffect(() => {
    let montat = true;
    activeUserIdRef.current = authUserId;
    hideBanner();
    setNotifications([]);
    notificationsRef.current = [];

    if (!authUserId) {
      return () => {
        montat = false;
      };
    }

    const expectedUserId = authUserId;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(notificationsKeyForUser(expectedUserId));
        if (montat && mountedRef.current && activeUserIdRef.current === expectedUserId && stored) {
          const parsed = JSON.parse(stored) as AppNotification[];
          if (Array.isArray(parsed)) {
            setNotifications(parsed);
            notificationsRef.current = parsed;
          }
        }
      } catch {
        // Ignoră eroarea de citire
      }
    })();

    return () => {
      montat = false;
    };
  }, [authUserId, hideBanner]);

  const saveNotifications = useCallback(async (list: AppNotification[], expectedUserId: string | null) => {
    if (!expectedUserId || activeUserIdRef.current !== expectedUserId) return;
    try {
      await AsyncStorage.setItem(notificationsKeyForUser(expectedUserId), JSON.stringify(list));
    } catch {
      // Ignoră eroarea de stocare
    }
  }, []);

  const showNotification = useCallback(
    ({
      title,
      message,
      type = 'info',
      duration = 3500,
      actionLabel,
      actionRoute,
      icon,
    }: BannerOptions) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      const ownerId = activeUserIdRef.current;
      const newNotif: AppNotification = {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type,
        title,
        message,
        icon,
        createdAt: new Date().toISOString(),
        read: false,
        actionLabel,
        actionRoute,
      };

      const updated = [newNotif, ...notificationsRef.current].slice(0, MAX_NOTIFICATIONS);
      setNotifications(updated);
      notificationsRef.current = updated;
      void saveNotifications(updated, ownerId);

      setBannerState({
        visible: true,
        title,
        message,
        type,
        actionLabel,
        actionRoute,
      });

      // Feedback Haptic în funcție de tip
      if (type === 'success' || type === 'reward') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else if (type === 'warning') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      } else if (type === 'error') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }

      if (duration > 0) {
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          if (!mountedRef.current) return;
          setBannerState((prev) => ({ ...prev, visible: false }));
        }, duration);
      }
    },
    [saveNotifications]
  );

  const markAllRead = useCallback(async () => {
    const ownerId = activeUserIdRef.current;
    const updated = notificationsRef.current.map((item) => ({ ...item, read: true }));
    setNotifications(updated);
    notificationsRef.current = updated;
    await saveNotifications(updated, ownerId);
  }, [saveNotifications]);

  const clearAll = useCallback(async () => {
    const ownerId = activeUserIdRef.current;
    setNotifications([]);
    notificationsRef.current = [];
    if (ownerId) {
      await AsyncStorage.removeItem(notificationsKeyForUser(ownerId));
    }
  }, []);

  // Ascultător pentru notificări push (foreground)
  useEffect(() => {
    if (Constants.appOwnership === 'expo') return; // Expo Go SDK 53+ nu mai suportă Android Push remote notifications
    try {
      const subscription = Notifications.addNotificationReceivedListener((notification) => {
        const content = notification.request.content;
        showNotification({
          title: content.title || 'GetFlow Reminder',
          message: content.body || undefined,
          type: 'reminder',
          duration: 4000,
        });
      });

      return () => {
        subscription.remove();
      };
    } catch {}
  }, [showNotification]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const actionsValue = React.useMemo<NotificationBannerActions>(() => ({
    showNotification,
    showBanner: showNotification,
    hideBanner,
    markAllRead,
    clearAll,
  }), [showNotification, hideBanner, markAllRead, clearAll]);

  const dataValue = React.useMemo<NotificationBannerData>(() => ({
    notifications,
    unreadCount,
  }), [notifications, unreadCount]);

  return (
    <NotificationBannerActionsContext.Provider value={actionsValue}>
      <NotificationBannerDataContext.Provider value={dataValue}>
        {children}
        <InAppNotification
          visible={bannerState.visible}
          title={bannerState.title}
          message={bannerState.message}
          type={bannerState.type}
          actionLabel={bannerState.actionLabel}
          actionRoute={bannerState.actionRoute}
          onDismiss={hideBanner}
        />
      </NotificationBannerDataContext.Provider>
    </NotificationBannerActionsContext.Provider>
  );
}
