import { APIGatewayProxyEvent } from 'aws-lambda';
import { getStayboardModels } from '../../data/stayboard';
import { appResponse } from '../../utils/stayboard/response';
import {
  issueStayboardAuthTokens,
  parseRefreshToken,
} from '../../utils/stayboard/auth';

const { User: StayboardUser } = getStayboardModels();

export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    if (!event.body) {
      return appResponse(400, {}, 'Missing request body');
    }

    const { refreshToken } = JSON.parse(event.body);
    if (!refreshToken || typeof refreshToken !== 'string') {
      return appResponse(400, {}, 'Refresh token is required');
    }

    const token = parseRefreshToken(refreshToken);
    if (!token) {
      return appResponse(401, {}, 'Invalid or expired refresh token');
    }

    const user = await StayboardUser.findById(token.userId);
    if (!user) {
      return appResponse(401, {}, 'User not found');
    }

    const authTokens = issueStayboardAuthTokens({
      userId: user._id,
      email: user.email || null,
      role: user.role,
      ownerId: user.ownerId || user._id,
    });

    return appResponse(
      200,
      {
        ...authTokens,
        user: {
          id: user._id,
          fullName: user.fullName,
          displayName: user.displayName || user.fullName,
          role: user.role,
          email: user.email || null,
          phone: user.phone,
          countryCode: user.countryCode,
        },
      },
      'Token refreshed'
    );
  } catch (error) {
    console.error(error);
    return appResponse(500, {}, 'Internal error');
  }
};
