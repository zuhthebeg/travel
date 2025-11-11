import { useState, useEffect, useCallback } from 'react';

interface CustomNotificationOptions extends NotificationOptions {
  onClick?: () => void;
}

interface UseBrowserNotificationsHook {
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  showNotification: (title: string, options?: CustomNotificationOptions) => void;
}

const useBrowserNotifications = (): UseBrowserNotificationsHook => {
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.warn('Browser does not support notifications.');
      return 'denied';
    }
    const newPermission = await Notification.requestPermission();
    setPermission(newPermission);
    return newPermission;
  }, []);

  const showNotification = useCallback((title: string, options?: CustomNotificationOptions) => {
    if (permission === 'granted') {
      const notification = new Notification(title, options);
      if (options?.onClick) {
        notification.onclick = options.onClick;
      }
    } else if (permission === 'default') {
      // Optionally request permission if it's still default
      requestPermission().then((newPermission) => {
        if (newPermission === 'granted') {
          const notification = new Notification(title, options);
          if (options?.onClick) {
            notification.onclick = options.onClick;
          }
        }
      });
    } else {
      console.warn('Notification permission denied.');
    }
  }, [permission, requestPermission]);

  return { permission, requestPermission, showNotification };
};

export default useBrowserNotifications;
