import { APIGatewayProxyEvent } from 'aws-lambda';
import StayboardUser from '../../models/stayboard/User';
import { parseToken } from '../../utils/stayboard/auth';
import { appResponse } from '../../utils/stayboard/response';

const normalizeEmail = (email: any): string | null => {
  const value = String(email ?? '').trim().toLowerCase();
  return value ? value : null;
};

export const meHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');

  const user = await StayboardUser.findById(token.userId).select('-password');
  if (!user) return appResponse(404, {}, 'User not found');

  return appResponse(200, {
    user: {
      id: user._id,
      fullName: user.fullName,
      displayName: user.displayName || user.fullName,
      email: user.email || null,
      phone: user.phone,
      countryCode: user.countryCode,
      role: user.role,
      ownerId: user.ownerId || user._id,
    },
  });
};

export const listStaffHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');
  if (token.role !== 'owner') return appResponse(403, {}, 'Forbidden');

  const staff = await StayboardUser.find({ ownerId: token.userId, role: 'housekeeping' }).select('-password').sort({ createdAt: -1 });
  return appResponse(200, { staff });
};

export const createStaffHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');
  if (token.role !== 'owner') return appResponse(403, {}, 'Forbidden');
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

  const staff = await StayboardUser.create({
    fullName: String(fullName).trim(),
    displayName: String(displayName || fullName).trim(),
    email: normalizedEmail,
    phone: normalizedPhone,
    countryCode: normalizedCountryCode,
    password: String(password),
    role: 'housekeeping',
    ownerId: token.userId,
  });

  return appResponse(201, {
    staff: {
      id: staff._id,
      fullName: staff.fullName,
      displayName: staff.displayName || staff.fullName,
      email: staff.email || null,
      phone: staff.phone,
      countryCode: staff.countryCode,
      role: staff.role,
    },
  }, 'Staff created');
};
