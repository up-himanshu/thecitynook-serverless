import { handler } from './reservationEnquiry';

describe('Reservation Enquiry Handler', () => {
  const validBody = {
    name: 'John Doe',
    email: 'john@example.com',
    dateFrom: '2024-01-01',
    dateTo: '2024-01-05',
    guestCount: 2
  };

  it('should accept valid reservation enquiry', async () => {
    const event = {
      body: JSON.stringify(validBody)
    };

    const response = await handler(event as any, {} as any, {} as any);
    
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      message: 'Reservation enquiry received'
    });
  });

  it('should require name field', async () => {
    const invalidBody = { ...validBody, name: undefined };
    const event = {
      body: JSON.stringify(invalidBody)
    };

    const response = await handler(event as any, {} as any, {} as any);
    
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Name is required'
    });
  });

  it('should require either phone or email', async () => {
    const invalidBody = { ...validBody, email: undefined };
    const event = {
      body: JSON.stringify(invalidBody)
    };

    const response = await handler(event as any, {} as any, {} as any);
    
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Either phone or email is required'
    });
  });
});