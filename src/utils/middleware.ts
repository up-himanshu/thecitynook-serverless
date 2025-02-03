import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const validateApiKey = (event: APIGatewayProxyEvent): APIGatewayProxyResult | null => {
  const apiKey = event.headers['x-api-key'];
  
  if (!apiKey || apiKey !== 'abc123') {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'Invalid API key' })
    };
  }
  
  return null;
};