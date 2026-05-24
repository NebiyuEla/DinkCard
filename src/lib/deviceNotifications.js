const STORAGE_KEY = 'dinkcard_notified_ids_v1';

function readSeenIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function writeSeenIds(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids].slice(-100)));
  } catch {}
}

export function getNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestDeviceNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}

export async function showDeviceNotification(notification) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return false;

  const title = notification?.title || 'Dink Card';
  const body = notification?.message || '';
  const payload = {
    body,
    tag: notification?.id || `dinkcard-${Date.now()}`,
    data: {
      url: notification?.link || '/notifications'
    }
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.showNotification) {
        await registration.showNotification(title, payload);
        return true;
      }
    }

    const instance = new Notification(title, payload);
    instance.onclick = () => {
      window.focus();
      if (payload.data?.url) window.location.assign(payload.data.url);
    };
    return true;
  } catch {
    return false;
  }
}

export function markNotificationsAsSeen(notifications = []) {
  const seen = readSeenIds();
  notifications.forEach((item) => item?.id && seen.add(item.id));
  writeSeenIds(seen);
}

export async function announceNewNotifications(notifications = []) {
  const seen = readSeenIds();
  const fresh = notifications.filter((item) => item?.id && !item.read && !seen.has(item.id));

  if (!fresh.length) return 0;

  for (const item of fresh.slice(0, 3)) {
    await showDeviceNotification(item);
    seen.add(item.id);
  }

  writeSeenIds(seen);
  return fresh.length;
}
