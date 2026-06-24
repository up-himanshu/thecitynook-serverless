import { APIGatewayProxyEvent } from 'aws-lambda';
import * as jwt from 'jsonwebtoken';

export type AppToken = {
  userId: string;
  role: 'owner' | 'housekeeping';
  ownerId?: string;
  email: string | null;
  tokenType: 'access' | 'refresh';
};

const getStayboardJwtSecret = () =>
  process.env.STAYBOARD_JWT_SECRET || 'stayboard-secret';

export const signStayboardAccessToken = (payload: Omit<AppToken, 'tokenType'>) =>
  jwt.sign(
    { ...payload, tokenType: 'access' },
    getStayboardJwtSecret(),
    { expiresIn: '7d' },
  );

export const signStayboardRefreshToken = (payload: Omit<AppToken, 'tokenType'>) =>
  jwt.sign(
    { ...payload, tokenType: 'refresh' },
    getStayboardJwtSecret(),
    { expiresIn: '30d' },
  );

export const issueStayboardAuthTokens = (payload: Omit<AppToken, 'tokenType'>) => ({
  token: signStayboardAccessToken(payload),
  refreshToken: signStayboardRefreshToken(payload),
});

export const parseToken = (event: APIGatewayProxyEvent): AppToken | null => {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, getStayboardJwtSecret()) as Partial<AppToken>;
    if (decoded.tokenType && decoded.tokenType !== 'access') return null;
    return decoded as AppToken;
  } catch {
    return null;
  }
};

export const parseRefreshToken = (token: string): AppToken | null => {
  try {
    const decoded = jwt.verify(token, getStayboardJwtSecret()) as AppToken;
    if (decoded.tokenType !== 'refresh') return null;
    return decoded;
  } catch {
    return null;
  }
};
