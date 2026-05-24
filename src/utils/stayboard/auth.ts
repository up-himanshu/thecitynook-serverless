import { APIGatewayProxyEvent } from 'aws-lambda';
import jwt from 'jsonwebtoken';

export type AppToken = { userId: string; role: 'owner' | 'housekeeping'; ownerId?: string; email: string };

export const parseToken = (event: APIGatewayProxyEvent): AppToken | null => {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  try {
    return jwt.verify(token, process.env.STAYBOARD_JWT_SECRET || 'stayboard-secret') as AppToken;
  } catch {
    return null;
  }
};
