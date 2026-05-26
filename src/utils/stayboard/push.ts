import admin from 'firebase-admin';

let initialized = false;

const initializeFirebaseAdmin = () => {
  if (initialized || admin.apps.length) {
    initialized = true;
    return;
  }

  const projectId = process.env.STAYBOARD_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.STAYBOARD_FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.STAYBOARD_FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKeyRaw) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKeyRaw.replace(/\\n/g, '\n'),
      }),
    });
    initialized = true;
    return;
  }

  throw new Error('Firebase Admin is not configured');
};

export const sendPushNotifications = async (tokens: string[], title: string, body: string) => {
  try {
    initializeFirebaseAdmin();
    const validTokens = [...new Set(tokens.filter((t) => typeof t === 'string' && t.trim().length > 20))];
    if (!validTokens.length) return;

    const chunkSize = 500;
    for (let i = 0; i < validTokens.length; i += chunkSize) {
      const chunk = validTokens.slice(i, i + chunkSize);
      const result = await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        android: { priority: 'high' },
        apns: {
          headers: {
            'apns-priority': '10',
            'apns-push-type': 'alert',
          },
          payload: { aps: { sound: 'default' } },
        },
      });

      if (result.failureCount > 0) {
        result.responses.forEach((response, index) => {
          if (!response.success) {
            console.error('FCM push send failed:', {
              token: chunk[index],
              error: response.error?.message,
            });
          }
        });
      }
    }
  } catch (error) {
    console.error('Push notification skipped:', error);
  }
};
