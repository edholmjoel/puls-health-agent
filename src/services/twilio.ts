import '../config';
import twilio from 'twilio';
import { TwilioMessageResponse } from '../types/twilio';
import { ExternalServiceError } from '../errors/AppError';
import logger from '../utils/logger';

class TwilioService {
  private client: twilio.Twilio;
  private whatsappNumber: string;
  private authToken: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || '';

    if (!accountSid || !authToken) {
      throw new Error('Missing Twilio credentials in environment variables');
    }

    if (!this.whatsappNumber) {
      throw new Error('Missing TWILIO_WHATSAPP_NUMBER in environment variables');
    }

    this.client = twilio(accountSid, authToken);
    this.authToken = authToken;
    logger.info('Twilio client initialized');
  }

  async sendMessage(to: string, body: string): Promise<TwilioMessageResponse> {
    if (process.env.DISABLE_TWILIO === 'true') {
      logger.info('Twilio disabled via DISABLE_TWILIO env var, skipping', { to });
      return {} as TwilioMessageResponse;
    }
    try {
      const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

      logger.debug('Sending WhatsApp message', { to: formattedTo, bodyLength: body.length });

      const message = await this.client.messages.create({
        from: this.whatsappNumber,
        to: formattedTo,
        body,
      });

      logger.info('WhatsApp message sent', {
        messageSid: message.sid,
        to: formattedTo,
        status: message.status,
      });

      return message as unknown as TwilioMessageResponse;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp message', {
        to,
        error: error.message,
        code: error.code,
      });
      throw new ExternalServiceError('Twilio', `Failed to send message: ${error.message}`);
    }
  }

  /**
   * Send multiple messages sequentially with small delays between them
   * Creates the rapid-fire texting effect like Poke
   * @param to - Phone number (e.g., '+46766334597')
   * @param messages - Array of message strings to send
   * @param delayMs - Milliseconds to wait between messages (default 150ms)
   */
  async sendMultipleMessages(to: string, messages: string[], delayMs: number = 150): Promise<void> {
    if (process.env.DISABLE_TWILIO === 'true') {
      logger.info('Twilio disabled via DISABLE_TWILIO env var, skipping', { to, messageCount: messages.length });
      return;
    }
    try {
      const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

      for (let i = 0; i < messages.length; i++) {
        await this.client.messages.create({
          from: this.whatsappNumber,
          to: formattedTo,
          body: messages[i],
        });

        logger.debug('Sequential message sent', {
          to: formattedTo,
          messageIndex: i + 1,
          totalMessages: messages.length,
          bodyLength: messages[i].length,
        });

        // Add delay between messages (except after the last one)
        if (i < messages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      logger.info('Multiple WhatsApp messages sent', {
        to: formattedTo,
        messageCount: messages.length,
        totalDelay: delayMs * (messages.length - 1),
      });
    } catch (error: any) {
      logger.error('Failed to send multiple WhatsApp messages', {
        to,
        error: error.message,
      });
      throw new ExternalServiceError('Twilio', `Failed to send messages: ${error.message}`);
    }
  }

  validateRequest(url: string, params: Record<string, string>, signature: string): boolean {
    try {
      const isValid = twilio.validateRequest(this.authToken, signature, url, params);

      if (!isValid) {
        logger.warn('Twilio webhook signature validation failed', { url });
      }

      return isValid;
    } catch (error: any) {
      logger.error('Twilio webhook validation error', { error: error.message });
      return false;
    }
  }
}

export default new TwilioService();
