import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import InAppNotification, { BannerType } from '../components/InAppNotification';

export interface BannerOptions {
  title: string;
  message?: string;
  type?: BannerType;
  duration?: number;
}

interface NotificationBannerContextType {
  showBanner: (options: BannerOptions) => void;
  hideBanner: () => void;
}

const NotificationBannerContext = createContext<NotificationBannerContextType>({
  showBanner: () => {},
  hideBanner: () => {},
});

export function useNotificationBanner(): NotificationBannerContextType {
  return useContext(NotificationBannerContext);
}

export function NotificationBannerProvider({ children }: { children: React.ReactNode }) {
  const [bannerState, setBannerState] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    type: BannerType;
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  const timeoutRef = useRef<any>(null);

  const hideBanner = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setBannerState((prev) => ({ ...prev, visible: false }));
  }, []);

  const showBanner = useCallback(
    ({ title, message, type = 'info', duration = 4000 }: BannerOptions) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setBannerState({
        visible: true,
        title,
        message,
        type,
      });

      if (duration > 0) {
        timeoutRef.current = setTimeout(() => {
          setBannerState((prev) => ({ ...prev, visible: false }));
        }, duration);
      }
    },
    []
  );

  // Ascultător pentru notificările primite când aplicația este în foreground
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      showBanner({
        title: content.title || 'NutriAI Reminder',
        message: content.body || undefined,
        type: 'reminder',
        duration: 5000,
      });
    });

    return () => {
      subscription.remove();
    };
  }, [showBanner]);

  return (
    <NotificationBannerContext.Provider value={{ showBanner, hideBanner }}>
      {children}
      <InAppNotification
        visible={bannerState.visible}
        title={bannerState.title}
        message={bannerState.message}
        type={bannerState.type}
        onDismiss={hideBanner}
      />
    </NotificationBannerContext.Provider>
  );
}
