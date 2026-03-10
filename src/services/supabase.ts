import '../config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Database,
  DbUser,
  DbUserInsert,
  DbUserUpdate,
  DbConversationState,
  DbConversationStateInsert,
  DbConversationStateUpdate,
  DbWearableData,
  DbDailyBriefInsert,
  DbDailyBrief,
} from '../types/database';
import { DbMemory, DbMemoryInsert, DbMemoryUpdate } from '../types/memory';
import { ExternalServiceError } from '../errors/AppError';
import logger from '../utils/logger';

class SupabaseService {
  private client: SupabaseClient<Database>;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials in environment variables');
    }

    this.client = createClient<Database>(supabaseUrl, supabaseKey);
    logger.info('Supabase client initialized');
  }

  // User operations
  async getUserByPhone(phoneNumber: string): Promise<DbUser | null> {
    try {
      const { data, error } = await this.client
        .from('users')
        .select('*')
        .eq('phone_number', phoneNumber)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new ExternalServiceError('Supabase', error.message);
      }

      return data;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error fetching user by phone', { phoneNumber, error });
      throw new ExternalServiceError('Supabase', 'Failed to fetch user');
    }
  }

  async getUserByTelegramId(telegramUserId: number): Promise<DbUser | null> {
    try {
      const { data, error } = await this.client
        .from('users')
        .select('*')
        .eq('telegram_user_id', telegramUserId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new ExternalServiceError('Supabase', error.message);
      }

      return data;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error fetching user by Telegram ID', { telegramUserId, error });
      throw new ExternalServiceError('Supabase', 'Failed to fetch user');
    }
  }

  async getUserByJunctionId(junctionUserId: string): Promise<DbUser | null> {
    try {
      const { data, error } = await this.client
        .from('users')
        .select('*')
        .eq('junction_user_id', junctionUserId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new ExternalServiceError('Supabase', error.message);
      }

      return data;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error fetching user by Junction ID', { junctionUserId, error });
      throw new ExternalServiceError('Supabase', 'Failed to fetch user');
    }
  }

  async createUser(userData: DbUserInsert): Promise<DbUser> {
    try {
      const { data, error } = await this.client
        .from('users')
        .insert(userData as any)
        .select()
        .single();

      if (error) {
        throw new ExternalServiceError('Supabase', error.message);
      }

      logger.info('User created', { userId: (data as DbUser).id, phoneNumber: userData.phone_number });
      return data as DbUser;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error creating user', { userData, error });
      throw new ExternalServiceError('Supabase', 'Failed to create user');
    }
  }

  async updateUser(userId: string, updates: DbUserUpdate): Promise<DbUser> {
    try {
      const { data, error } = await (this.client
        .from('users') as any)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        logger.error('Supabase user update error', {
          error,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          userId,
          updates
        });
        throw new ExternalServiceError('Supabase', error.message);
      }

      logger.info('User updated', { userId, updates });
      return data as DbUser;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error updating user', { userId, updates, error });
      throw new ExternalServiceError('Supabase', 'Failed to update user');
    }
  }

  async getActiveUsers(platform?: 'whatsapp' | 'telegram'): Promise<DbUser[]> {
    try {
      let query = this.client
        .from('users')
        .select('*')
        .eq('onboarding_complete', true);

      if (platform) {
        query = query.eq('platform', platform);
      }

      const { data, error } = await query;

      if (error) {
        throw new ExternalServiceError('Supabase', error.message);
      }

      return data || [];
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error fetching active users', { platform, error });
      throw new ExternalServiceError('Supabase', 'Failed to fetch active users');
    }
  }

  // Conversation state operations
  async getConversationState(userId: string): Promise<DbConversationState | null> {
    try {
      const { data, error } = await this.client
        .from('conversation_state')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('Supabase conversation_state fetch error', {
          error,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          userId
        });
        throw new ExternalServiceError('Supabase', error.message);
      }

      return data;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error fetching conversation state', { userId, error });
      throw new ExternalServiceError('Supabase', 'Failed to fetch conversation state');
    }
  }

  async createConversationState(stateData: DbConversationStateInsert): Promise<DbConversationState> {
    try {
      const { data, error } = await this.client
        .from('conversation_state')
        .insert(stateData as any)
        .select()
        .single();

      if (error) {
        logger.error('Supabase conversation_state insert error', {
          error,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        throw new ExternalServiceError('Supabase', error.message);
      }

      logger.info('Conversation state created', { userId: stateData.user_id, state: stateData.state });
      return data;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error creating conversation state', { stateData, error });
      throw new ExternalServiceError('Supabase', 'Failed to create conversation state');
    }
  }

  async updateConversationState(
    userId: string,
    updates: DbConversationStateUpdate
  ): Promise<DbConversationState> {
    try {
      const { data, error } = await (this.client
        .from('conversation_state') as any)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw new ExternalServiceError('Supabase', error.message);
      }

      logger.info('Conversation state updated', { userId, updates });
      return data as DbConversationState;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error updating conversation state', { userId, updates, error });
      throw new ExternalServiceError('Supabase', 'Failed to update conversation state');
    }
  }

  // Wearable data operations
  async storeWearableData(dataToStore: {
    user_id: string;
    junction_user_id: string;
    event_type: string;
    provider?: string;
    payload: any;
  }): Promise<any> {
    try {
      const { data, error } = await this.client
        .from('wearable_data')
        .insert({
          user_id: dataToStore.user_id,
          junction_user_id: dataToStore.junction_user_id,
          event_type: dataToStore.event_type,
          provider: dataToStore.provider || null,
          payload: dataToStore.payload,
          received_at: new Date().toISOString(),
        } as any)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          logger.warn('Duplicate wearable data event ignored', {
            eventType: dataToStore.event_type
          });
          throw error;
        }
        logger.error('Supabase wearable_data insert error', {
          error,
          code: error.code,
          message: error.message,
          details: error.details
        });
        throw new ExternalServiceError('Supabase', error.message);
      }

      logger.info('Wearable data stored', {
        userId: dataToStore.user_id,
        eventType: dataToStore.event_type,
      });
      return data;
    } catch (error: any) {
      if (error?.code === '23505') {
        throw error;
      }
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error storing wearable data', { dataToStore, error });
      throw new ExternalServiceError('Supabase', 'Failed to store wearable data');
    }
  }

  async getWearableDataForUser(
    userId: string,
    startDate: string,
    endDate?: string
  ): Promise<DbWearableData[]> {
    try {
      // Ensure dates include time for proper timestamp comparison
      const startTimestamp = startDate.includes('T') ? startDate : `${startDate}T00:00:00Z`;
      const endTimestamp = endDate
        ? (endDate.includes('T') ? endDate : `${endDate}T23:59:59Z`)
        : undefined;

      // Only fetch daily/historical summary events — exclude timeseries noise (heartrate, steps, etc.)
      const USEFUL_EVENT_TYPES = [
        'daily.data.sleep.created',
        'daily.data.activity.created',
        'daily.data.workouts.created',
        'historical.data.sleep.created',
        'historical.data.activity.created',
        'historical.data.workouts.created',
      ];

      let query = this.client
        .from('wearable_data')
        .select('*')
        .eq('user_id', userId)
        .in('event_type', USEFUL_EVENT_TYPES)
        .gte('received_at', startTimestamp)
        .order('received_at', { ascending: false })
        .limit(100);

      if (endTimestamp) {
        query = query.lte('received_at', endTimestamp);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Supabase wearable_data fetch error', {
          error,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          userId,
          startDate,
          endDate
        });
        throw new ExternalServiceError('Supabase', error.message);
      }

      return data || [];
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error fetching wearable data', { userId, startDate, endDate, error });
      throw new ExternalServiceError('Supabase', 'Failed to fetch wearable data');
    }
  }

  // Daily briefs operations
  async storeDailyBrief(briefData: DbDailyBriefInsert): Promise<DbDailyBrief> {
    try {
      const { data, error } = await this.client
        .from('daily_briefs')
        .insert(briefData as any)
        .select()
        .single();

      if (error) {
        throw new ExternalServiceError('Supabase', error.message);
      }

      logger.info('Daily brief stored', { userId: briefData.user_id, date: briefData.date });
      return data;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error storing daily brief', { briefData, error });
      throw new ExternalServiceError('Supabase', 'Failed to store daily brief');
    }
  }

  async getBriefForDate(userId: string, date: string): Promise<DbDailyBrief | null> {
    try {
      const { data, error } = await this.client
        .from('daily_briefs')
        .select('*')
        .eq('user_id', userId)
        .eq('date', date)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new ExternalServiceError('Supabase', error.message);
      }

      return data;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error fetching daily brief', { userId, date, error });
      throw new ExternalServiceError('Supabase', 'Failed to fetch daily brief');
    }
  }

  // Memory operations
  async storeMemory(memoryData: DbMemoryInsert): Promise<DbMemory> {
    try {
      const { data, error } = await this.client
        .from('user_memories')
        .insert(memoryData as any)
        .select()
        .single();

      if (error) {
        throw new ExternalServiceError('Supabase', error.message);
      }

      logger.info('Memory stored', {
        userId: memoryData.user_id,
        type: memoryData.memory_type,
        scheduled: !!memoryData.scheduled_for,
      });
      return data;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error storing memory', { memoryData, error });
      throw new ExternalServiceError('Supabase', 'Failed to store memory');
    }
  }

  async getActiveMemories(userId: string, limit: number = 20): Promise<DbMemory[]> {
    try {
      const { data, error } = await this.client
        .from('user_memories')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new ExternalServiceError('Supabase', error.message);
      }

      return data || [];
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error fetching memories', { userId, error });
      throw new ExternalServiceError('Supabase', 'Failed to fetch memories');
    }
  }

  async getScheduledReminders(beforeDate: string): Promise<DbMemory[]> {
    try {
      const { data, error } = await this.client
        .from('user_memories')
        .select('*')
        .eq('memory_type', 'reminder')
        .is('reminded_at', null)
        .is('deleted_at', null)
        .lte('scheduled_for', beforeDate);

      if (error) {
        throw new ExternalServiceError('Supabase', error.message);
      }

      return data || [];
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error fetching scheduled reminders', { beforeDate, error });
      throw new ExternalServiceError('Supabase', 'Failed to fetch scheduled reminders');
    }
  }

  async updateMemory(memoryId: string, updates: DbMemoryUpdate): Promise<DbMemory> {
    try {
      const { data, error } = await (this.client.from('user_memories') as any)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', memoryId)
        .select()
        .single();

      if (error) {
        throw new ExternalServiceError('Supabase', error.message);
      }

      logger.info('Memory updated', { memoryId, updates });
      return data as DbMemory;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error updating memory', { memoryId, updates, error });
      throw new ExternalServiceError('Supabase', 'Failed to update memory');
    }
  }

  async deleteMemory(memoryId: string): Promise<void> {
    try {
      const { error } = await (this.client.from('user_memories') as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', memoryId);

      if (error) {
        throw new ExternalServiceError('Supabase', error.message);
      }

      logger.info('Memory deleted', { memoryId });
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error deleting memory', { memoryId, error });
      throw new ExternalServiceError('Supabase', 'Failed to delete memory');
    }
  }

  // Health profile operations
  async getHealthProfile(userId: string): Promise<any | null> {
    try {
      const { data, error } = await (this.client.from('health_profiles') as any)
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.warn('Error fetching health profile', { userId, error: error.message });
        return null;
      }

      return data || null;
    } catch (error) {
      logger.warn('Could not fetch health profile', { userId, error });
      return null;
    }
  }

  async storeHealthProfile(userId: string, profile: any, meta: {
    totalWorkoutsAnalyzed: number;
    dataRangeStart?: string;
    dataRangeEnd?: string;
  }): Promise<void> {
    try {
      const { error } = await (this.client.from('health_profiles') as any)
        .upsert({
          user_id: userId,
          profile,
          total_workouts_analyzed: meta.totalWorkoutsAnalyzed,
          data_range_start: meta.dataRangeStart || null,
          data_range_end: meta.dataRangeEnd || null,
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) {
        throw new ExternalServiceError('Supabase', error.message);
      }

      logger.info('Health profile stored', { userId });
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error storing health profile', { userId, error });
      throw new ExternalServiceError('Supabase', 'Failed to store health profile');
    }
  }

  async searchMemories(userId: string, searchTerm: string): Promise<DbMemory[]> {
    try {
      const { data, error } = await this.client
        .from('user_memories')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .ilike('content', `%${searchTerm}%`)
        .order('created_at', { ascending: false });

      if (error) {
        throw new ExternalServiceError('Supabase', error.message);
      }

      return data || [];
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error('Error searching memories', { userId, searchTerm, error });
      throw new ExternalServiceError('Supabase', 'Failed to search memories');
    }
  }
}

export default new SupabaseService();
