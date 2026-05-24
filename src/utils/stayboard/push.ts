export const sendPushNotifications = async (tokens: string[], title: string, body: string) => {
  try {
    const validTokens = tokens.filter((t) => /^ExponentPushToken\[[^\]]+\]$/.test(t));
    if (!validTokens.length) return;

    const chunkSize = 100;
    for (let i = 0; i < validTokens.length; i += chunkSize) {
      const chunk = validTokens.slice(i, i + chunkSize).map((to) => ({
        to,
        title,
        body,
        sound: 'default',
      }));

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
          ...(process.env.STAYBOARD_EXPO_ACCESS_TOKEN
            ? { Authorization: `Bearer ${process.env.STAYBOARD_EXPO_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        const message = await response.text();
        console.error('Expo push request failed:', response.status, message);
      }
    }
  } catch (error) {
    console.error('Push notification skipped:', error);
  }
};
