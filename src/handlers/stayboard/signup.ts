import { APIGatewayProxyEvent } from 'aws-lambda';
import { getStayboardModels } from '../../data/stayboard';
import { appResponse } from '../../utils/stayboard/response';
import { issueStayboardAuthTokens } from '../../utils/stayboard/auth';

const { User: StayboardUser } = getStayboardModels();

const normalizeEmail = (email: any): string | null => {
  const value = String(email ?? '').trim().toLowerCase();
  return value ? value : null;
};

export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    if (!event.body) return appResponse(400, {}, 'Missing request body');
    const { fullName, displayName, email, phone, countryCode, password } = JSON.parse(event.body);

    const normalizedPhone = String(phone || '').replace(/\D/g, '');
    const normalizedCountryCode = String(countryCode || '91').trim();
    const normalizedEmail = normalizeEmail(email);

    if (!fullName || !password || normalizedPhone.length !== 10) {
      return appResponse(400, {}, 'fullName, valid 10-digit phone and password are required');
    }

    const existingPhone = await StayboardUser.findOne({ countryCode: normalizedCountryCode, phone: normalizedPhone });
    if (existingPhone) return appResponse(409, {}, 'Phone already in use');

    if (normalizedEmail) {
      const existingEmail = await StayboardUser.findOne({ email: normalizedEmail });
      if (existingEmail) return appResponse(409, {}, 'Email already in use');
    }

    const user = await StayboardUser.create({
      fullName: String(fullName).trim(),
      displayName: String(displayName || fullName).trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      countryCode: normalizedCountryCode,
      password: String(password),
      role: 'owner',
    });

    await StayboardUser.updateOne({ _id: user._id }, { $set: { ownerId: user._id } });

    const authTokens = issueStayboardAuthTokens({
      userId: user._id,
      email: user.email || null,
      role: user.role,
      ownerId: user._id,
    });

    return appResponse(
      201,
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
      'Signup successful'
    );
  } catch (error) {
    console.error(error);
    return appResponse(500, {}, 'Internal error');
  }
};
