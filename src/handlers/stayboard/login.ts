import { APIGatewayProxyEvent } from 'aws-lambda';
import jwt from 'jsonwebtoken';
import StayboardUser from '../../models/stayboard/User';
import { appResponse } from '../../utils/stayboard/response';
import { ensureDemoUsers } from '../../utils/stayboard/seed';

export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    await ensureDemoUsers();
    if (!event.body) return appResponse(400, {}, 'Missing request body');
    const { phone, password, countryCode } = JSON.parse(event.body);

    const normalizedPhone = String(phone || '').replace(/\D/g, '');
    const normalizedCountryCode = String(countryCode || '91').trim();

    if (!normalizedPhone || normalizedPhone.length !== 10 || !password) {
      return appResponse(400, {}, 'Valid 10-digit phone and password are required');
    }

    const user = await StayboardUser.findOne({
      countryCode: normalizedCountryCode,
      phone: normalizedPhone,
    });
    if (!user) return appResponse(401, {}, 'Invalid credentials');

    const valid = await user.comparePassword(password);
    if (!valid) return appResponse(401, {}, 'Invalid credentials');

    const token = jwt.sign({ userId: user._id, email: user.email, role: user.role, ownerId: user.ownerId || user._id }, process.env.STAYBOARD_JWT_SECRET || 'stayboard-secret', { expiresIn: '7d' });
    return appResponse(200, { token, user: { id: user._id, fullName: user.fullName, displayName: user.displayName || user.fullName, role: user.role, email: user.email || null, phone: user.phone, countryCode: user.countryCode } }, 'Login successful');
  } catch (error) {
    console.error(error);
    return appResponse(500, {}, 'Internal error');
  }
};
