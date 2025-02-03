import { handler } from './hello';

describe('Hello Handler', () => {
  it('should return working message', async () => {
    const response = await handler({} as any, {} as any, {} as any);
    
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      message: 'working'
    });
  });
});