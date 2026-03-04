import '../config';
import { Webhook } from 'svix';
import {
  JunctionUser,
  JunctionLinkToken,
  JunctionWebhookEvent,
} from '../types/junction';
import { ExternalServiceError } from '../errors/AppError';
import logger from '../utils/logger';

class JunctionService {
  private baseURL: string;
  private apiKey: string;
  private webhookSecret: string;

  constructor() {
    this.baseURL = 'https://api.sandbox.eu.junction.com';
    this.apiKey = process.env.JUNCTION_API_KEY || '';
    this.webhookSecret = process.env.JUNCTION_WEBHOOK_SECRET || '';

    if (!this.apiKey) {
      throw new Error('Missing JUNCTION_API_KEY in environment variables');
    }
    if (!this.webhookSecret) {
      throw new Error('Missing JUNCTION_WEBHOOK_SECRET in environment variables');
    }

    logger.info('Junction service initialized');
  }

  private async makeRequest<T>(
    endpoint: string,
    method: string = 'GET',
    body?: any
  ): Promise<T> {
    try {
      const url = `${this.baseURL}${endpoint}`;
      const headers: Record<string, string> = {
        'x-vital-api-key': this.apiKey,
        'Content-Type': 'application/json',
      };

      const options: RequestInit = {
        method,
        headers,
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      logger.debug('Junction API request', { method, endpoint, body });

      const response = await fetch(url, options);
      const responseData = await response.json() as any;

      if (!response.ok) {
        logger.error('Junction API error', {
          status: response.status,
          statusText: response.statusText,
          response: responseData,
        });

        // Include user_id in error message if it exists (for duplicate user errors)
        const errorMsg = responseData?.detail?.error_message || responseData?.message || response.statusText;
        const userId = responseData?.detail?.user_id;
        const fullError = userId ? `${errorMsg} user_id: "${userId}"` : errorMsg;

        throw new ExternalServiceError('Junction', `API request failed: ${fullError}`);
      }

      logger.debug('Junction API response', { endpoint, data: responseData });
      return responseData as T;
    } catch (error: any) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Junction API request failed', { endpoint, error: error.message });
      throw new ExternalServiceError('Junction', error.message);
    }
  }

  async createUser(clientUserId: string): Promise<JunctionUser> {
    return this.makeRequest<JunctionUser>('/v2/user', 'POST', {
      client_user_id: clientUserId,
    });
  }

  async getLinkToken(userId: string): Promise<JunctionLinkToken> {
    return this.makeRequest<JunctionLinkToken>('/v2/link/token', 'POST', {
      user_id: userId,
    });
  }

  async getSleepSummary(userId: string, startDate: string, endDate: string): Promise<any> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    return this.makeRequest(`/v2/summary/sleep/${userId}?${params}`);
  }

  async getActivitySummary(userId: string, startDate: string, endDate: string): Promise<any> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    return this.makeRequest(`/v2/summary/activity/${userId}?${params}`);
  }

  async getWorkoutsSummary(userId: string, startDate: string, endDate: string): Promise<any> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    return this.makeRequest(`/v2/summary/workouts/${userId}?${params}`);
  }

  async getBodySummary(userId: string, startDate: string, endDate: string): Promise<any> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    return this.makeRequest(`/v2/summary/body/${userId}?${params}`);
  }

  verifyWebhook(payload: string, headers: Record<string, string>): JunctionWebhookEvent {
    try {
      const webhook = new Webhook(this.webhookSecret);

      const svixId = headers['svix-id'];
      const svixTimestamp = headers['svix-timestamp'];
      const svixSignature = headers['svix-signature'];

      if (!svixId || !svixTimestamp || !svixSignature) {
        throw new Error('Missing required Svix headers');
      }

      const verified = webhook.verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as JunctionWebhookEvent;

      logger.info('Webhook verified successfully', {
        eventType: verified.event_type,
        userId: verified.user_id,
      });

      return verified;
    } catch (error: any) {
      logger.error('Webhook verification failed', { error: error.message });
      throw new ExternalServiceError('Junction', `Webhook verification failed: ${error.message}`);
    }
  }
}

export default new JunctionService();
