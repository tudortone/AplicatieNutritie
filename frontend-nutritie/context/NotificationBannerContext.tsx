import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import InAppNotification from '../components/InAppNotification';

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

const NotificationBannerContext = createContext<NotificationBannerContextType>({
  showNotification: () => {},
  showBanner: () => {},
  hideBanner: () => {},
  notifications: [],
  unreadCount: 0,
  markAllRead: async () => {},
  clearAll: async () => {},
});

export function useNotificationBanner(): NotificationBannerContextType {
  return useContext(NotificationBannerContext);
}

export function NotificationBannerProvider({ children }: { children: React.ReactNode }) {
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

  // Încarcă istoricul notificărilor din AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as AppNotification[];
          setNotifications(parsed);
        }
      } catch {
        // Ignoră eroarea de citire
      }
    })();
  }, []);

  const saveNotifications = async (list: AppNotification[]) => {
    try {
      await AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Ignoră eroarea de stocare
    }
  };

  const hideBanner = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setBannerState((prev) => ({ ...prev, visible: false }));
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

      setNotifications((prev) => {
        const updated = [newNotif, ...prev].slice(0, MAX_NOTIFICATIONS);
        saveNotifications(updated);
        return updated;
      });

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
          setBannerState((prev) => ({ ...prev, visible: false }));
        }, duration);
      }
    },
    []
  );

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => {
      const updated = prev.map((item) => ({ ...item, read: true }));
      saveNotifications(updated);
      return updated;
    });
  }, []);

  const clearAll = useCallback(async () => {
    setNotifications([]);
    await AsyncStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
  }, []);

  // Ascultător pentru notificări push (foreground)
  useEffect(() => {
    if (Constants.appOwnership === 'expo') return; // Expo Go SDK 53+ nu mai suportă Android Push remote notifications
    try {
      const subscription = Notifications.addNotificationReceivedListener((notification) => {
        const content = notification.request.content;
        showNotification({
          title: content.title || 'NutriAI Reminder',
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

  return (
    <NotificationBannerContext.Provider
      value={{
        showNotification,
        showBanner: showNotification,
        hideBanner,
        notifications,
        unreadCount,
        markAllRead,
        clearAll,
      }}
    >
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
    </NotificationBannerContext.Provider>
  );
}
