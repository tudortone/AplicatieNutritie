import { useNotificationBanner } from '../context/NotificationBannerContext';

export function useNotify() {
  const { showNotification } = useNotificationBanner();

  return {
    success: (title: string, message?: string, actionLabel?: string, actionRoute?: string) =>
      showNotification({
        type: 'success',
        title,
        message,
        actionLabel,
        actionRoute,
        icon: 'CheckCircle',
      }),
    info: (title: string, message?: string, actionLabel?: string, actionRoute?: string) =>
      showNotification({
        type: 'info',
        title,
        message,
        actionLabel,
        actionRoute,
        icon: 'Info',
      }),
    warning: (title: string, message?: string, actionLabel?: string, actionRoute?: string) =>
      showNotification({
        type: 'warning',
        title,
        message,
        actionLabel,
        actionRoute,
        icon: 'AlertTriangle',
      }),
    error: (title: string, message?: string, actionLabel?: string, actionRoute?: string) =>
      showNotification({
        type: 'error',
        title,
        message,
        actionLabel,
        actionRoute,
        icon: 'XCircle',
      }),
    reward: (title: string, message?: string, actionLabel?: string, actionRoute?: string) =>
      showNotification({
        type: 'reward',
        title,
        message,
        actionLabel,
        actionRoute,
        icon: 'Trophy',
      }),
  };
}
