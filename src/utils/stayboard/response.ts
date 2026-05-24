export const appResponse = (statusCode: number, data: any = {}, message = 'ok') => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,Key',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  },
  body: statusCode >= 400 ? JSON.stringify({ error: message }) : JSON.stringify({ message, data }),
});
