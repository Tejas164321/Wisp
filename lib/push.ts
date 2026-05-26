import webpush from 'web-push';
import { getAllPushSubscriptions, removePushSubscription } from './redis';
import type { Message } from './message-types';

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const appUrl = process.env.APP_URL || 'http://localhost:3000';
const notificationUrl = '/';

function getVapidContactEmail(urlValue: string) {
  try {
    return `mailto:admin@${new URL(urlValue).hostname}`;
  } catch {
    return 'mailto:admin@localhost';
  }
}

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    getVapidContactEmail(appUrl),
    vapidPublicKey,
    vapidPrivateKey
  );
} else {
  console.warn('⚠️ Web Push VAPID keys not configured in environment variables.');
}

export async function sendPushNotifications(message: Message, senderClientId?: string) {
  if (!vapidPublicKey || !vapidPrivateKey) return;

  const isMemeAudio = message.type === 'meme_audio';
  const payload = JSON.stringify({
    title: isMemeAudio ? `Meme sound from ${message.nickname}` : `New whisper from ${message.nickname}`,
    body: isMemeAudio ? (message.memeAudio?.title || 'Shared a meme sound') : (message.text || ''),
    url: notificationUrl,
    icon: '/icon-192.png',
  });

  const subscriptions = await getAllPushSubscriptions();

  const notifications = subscriptions
    .filter((sub) => sub.clientId !== senderClientId)
    .map(async (sub) => {
      try {
        await webpush.sendNotification(sub.subscription, payload);
      } catch (error: any) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          // Subscription has expired or is no longer valid
          console.log(`Push subscription ${sub.clientId} expired, removing...`);
          await removePushSubscription(sub.clientId);
        } else {
          console.error('Failed to send push notification:', error);
        }
      }
    });

  await Promise.allSettled(notifications);
}
