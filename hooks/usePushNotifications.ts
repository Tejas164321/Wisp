import { useState, useEffect } from 'react';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
      
      navigator.serviceWorker.ready.then((registration) => {
        registration.pushManager.getSubscription().then((sub) => {
          setSubscription(sub);
        });
      });
    }
  }, []);

  const getClientId = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('ghostroom_client_id');
  };

  const syncSubscriptionToServer = async (sub: PushSubscription) => {
    const clientId = getClientId();
    if (!clientId) return;

    await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, subscription: sub }),
    });
  };

  const createSubscription = async (shouldRequestPermission: boolean) => {
    if (!isSupported) return null;

    let finalPermission = Notification.permission;
    if (shouldRequestPermission) {
      finalPermission = await Notification.requestPermission();
      setPermission(finalPermission);
    }

    if (finalPermission !== 'granted') {
      return null;
    }

    const registration = await navigator.serviceWorker.ready;
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    if (!vapidPublicKey) {
      console.error('Missing VAPID public key');
      return null;
    }

    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    setSubscription(sub);
    await syncSubscriptionToServer(sub);
    return sub;
  };

  const subscribe = async () => {
    try {
      const sub = await createSubscription(true);
      return !!sub;
    } catch (err) {
      console.error('Failed to subscribe to push notifications:', err);
      return false;
    }
  };

  const unsubscribe = async () => {
    if (!subscription) return false;

    try {
      await subscription.unsubscribe();
      setSubscription(null);
      
      // Remove subscription from server
      const clientId = getClientId();
      if (clientId) {
        await fetch(`/api/push?clientId=${encodeURIComponent(clientId)}`, {
          method: 'DELETE',
        });
      }
      return true;
    } catch (err) {
      console.error('Failed to unsubscribe from push notifications:', err);
      return false;
    }
  };

  useEffect(() => {
    if (!isSupported) return;

    navigator.serviceWorker.ready
      .then(async (registration) => {
        const existingSub = await registration.pushManager.getSubscription();
        if (existingSub) {
          setSubscription(existingSub);
          await syncSubscriptionToServer(existingSub);
          return;
        }

        if (Notification.permission === 'granted') {
          await createSubscription(false);
        }
      })
      .catch((err) => {
        console.error('Failed to initialize push subscription:', err);
      });
  }, [isSupported]);

  return {
    isSupported,
    subscription,
    permission,
    subscribe,
    unsubscribe,
  };
}
