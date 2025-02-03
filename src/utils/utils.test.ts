import { sendEmail } from './utils';
import AWS from 'aws-sdk';

jest.mock('aws-sdk', () => {
  return {
    SES: jest.fn(() => ({
      sendEmail: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      })
    }))
  };
});

describe('sendEmail', () => {
  it('should send email successfully', async () => {
    const emailParams = {
      to: ['test@example.com'],
      subject: 'Test Subject',
      body: '<p>Test body</p>',
      from: 'sender@example.com'
    };

    const result = await sendEmail(emailParams);
    expect(result).toBe(true);
  });

  it('should handle errors', async () => {
    const mockSES = new AWS.SES();
    (mockSES.sendEmail as jest.Mock).mockReturnValue({
      promise: jest.fn().mockRejectedValue(new Error('Failed to send'))
    });

    const emailParams = {
      to: ['test@example.com'],
      subject: 'Test Subject',
      body: '<p>Test body</p>',
      from: 'sender@example.com'
    };

    const result = await sendEmail(emailParams);
    expect(result).toBe(false);
  });
});