import { getStayboardModels } from '../../data/stayboard';

const { User: StayboardUser } = getStayboardModels();

export const ensureDemoUsers = async () => {
  const owner = await StayboardUser.findOne({ countryCode: '91', phone: '9999999999' });
  if (!owner) {
    const createdOwner = await StayboardUser.create({
      fullName: 'Demo Owner',
      displayName: 'Demo Owner',
      email: 'owner@demo.com',
      phone: '9999999999',
      countryCode: '91',
      password: 'Demo@1234',
      role: 'owner',
    });

    await StayboardUser.create({
      fullName: 'Raj Housekeeping',
      displayName: 'Raj',
      email: 'hk@demo.com',
      phone: '8888888888',
      countryCode: '91',
      password: 'Demo@1234',
      role: 'housekeeping',
      ownerId: createdOwner._id,
    });
  }
};
