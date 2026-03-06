import '../config';
import axios from 'axios';
import {
  TelegramSendMessageResponse,
  TelegramGetMeResponse,
  TelegramSetWebhookResponse,
} from '../types/telegram';
import { ExternalServiceError } from '../errors/AppError';
import logger from '../utils/logger';

class TelegramService {
  private botToken: string;
  private apiBaseUrl: string;

  constructor() {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      throw new Error('Missing TELEGRAM_BOT_TOKEN in environment variables');
    }

    this.botToken = botToken;
    this.apiBaseUrl = `https://api.telegram.org/bot${this.botToken}`;
    logger.info('Telegram bot initialized');
  }

  /**
   * Send a single message to a Telegram user
   * @param chatId - Telegram chat/user ID (numeric)
   * @param text - Message text to send
   * @returns Promise with Telegram API response
   */
  async sendMessage(chatId: number | string, text: string): Promise<TelegramSendMessageResponse> {
    try {
      const url = `${this.apiBaseUrl}/sendMessage`;

      logger.debug('Sending Telegram message', { chatId, textLength: text.length });

      const response = await axios.post<TelegramSendMessageResponse>(url, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      });

      if (!response.data.ok) {
        throw new Error(response.data.description || 'Failed to send message');
      }

      logger.info('Telegram message sent', {
        chatId,
        messageId: response.data.result?.message_id,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to send Telegram message', {
        chatId,
        error: error.message,
        response: error.response?.data,
      });
      throw new ExternalServiceError('Telegram', `Failed to send message: ${error.message}`);
    }
  }

  /**
   * Send multiple messages sequentially with delays between them
   * Creates rapid-fire texting effect
   * @param chatId - Telegram chat/user ID
   * @param messages - Array of message strings to send
   * @param delayMs - Milliseconds to wait between messages (default 150ms)
   */
  async sendMultipleMessages(
    chatId: number | string,
    messages: string[],
    delayMs: number = 150
  ): Promise<void> {
    try {
      for (let i = 0; i < messages.length; i++) {
        await this.sendMessage(chatId, messages[i]);

        logger.debug('Sequential Telegram message sent', {
          chatId,
          messageIndex: i + 1,
          totalMessages: messages.length,
          textLength: messages[i].length,
        });

        // Add delay between messages (except after the last one)
        if (i < messages.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      logger.info('Multiple Telegram messages sent', {
        chatId,
        messageCount: messages.length,
        totalDelay: delayMs * (messages.length - 1),
      });
    } catch (error: any) {
      logger.error('Failed to send multiple Telegram messages', {
        chatId,
        error: error.message,
      });
      throw new ExternalServiceError('Telegram', `Failed to send messages: ${error.message}`);
    }
  }

  /**
   * Configure Telegram webhook URL
   * @param webhookUrl - Public HTTPS URL for webhook
   * @returns Promise with API response
   */
  async setWebhook(webhookUrl: string): Promise<TelegramSetWebhookResponse> {
    try {
      const url = `${this.apiBaseUrl}/setWebhook`;

      logger.info('Setting Telegram webhook', { webhookUrl });

      const response = await axios.post<TelegramSetWebhookResponse>(url, {
        url: webhookUrl,
        allowed_updates: ['message'],
      });

      if (!response.data.ok) {
        throw new Error(response.data.description || 'Failed to set webhook');
      }

      logger.info('Telegram webhook configured', { webhookUrl });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to set Telegram webhook', {
        webhookUrl,
        error: error.message,
        response: error.response?.data,
      });
      throw new ExternalServiceError('Telegram', `Failed to set webhook: ${error.message}`);
    }
  }

  /**
   * Get bot information (for health checks)
   * @returns Promise with bot user info
   */
  async getMe(): Promise<TelegramGetMeResponse> {
    try {
      const url = `${this.apiBaseUrl}/getMe`;

      const response = await axios.get<TelegramGetMeResponse>(url);

      if (!response.data.ok) {
        throw new Error('Failed to get bot info');
      }

      logger.debug('Bot info retrieved', {
        username: response.data.result.username,
        id: response.data.result.id,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to get bot info', {
        error: error.message,
        response: error.response?.data,
      });
      throw new ExternalServiceError('Telegram', `Failed to get bot info: ${error.message}`);
    }
  }
}

export default new TelegramService();
