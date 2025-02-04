export const handler = async () => {
  return {
    statusCode: 204,
    headers: {
      "Access-Control-Allow-Origin": "https://www.thecitynook.com",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: null
  };
};
