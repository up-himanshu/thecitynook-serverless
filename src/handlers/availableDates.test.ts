import { handler } from './availableDates';

describe('Available Dates Handler', () => {
  it('should return blocked dates with valid API key', async () => {
    const event = {
      headers: {
        'x-api-key': 'abc123'
      }
    };

    const response = await handler(event as any, {} as any, {} as any);
    
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      blocked_dates: [
        "2025-02-01",
        "2025-02-02",
        "2025-02-05",
        "2025-02-15"
      ]
    });
  });

  it('should return 403 with invalid API key', async () => {
    const event = {
      headers: {
        'x-api-key': 'wrong-key'
      }
    };

    const response = await handler(event as any, {} as any, {} as any);
    
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Invalid API key'
    });
  });
});