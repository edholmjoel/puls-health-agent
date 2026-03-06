export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          phone_number: string | null;
          telegram_user_id: number | null;
          platform: 'whatsapp' | 'telegram';
          name: string | null;
          junction_user_id: string | null;
          onboarding_complete: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          phone_number?: string | null;
          telegram_user_id?: number | null;
          platform?: 'whatsapp' | 'telegram';
          name?: string | null;
          junction_user_id?: string | null;
          onboarding_complete?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          phone_number?: string | null;
          telegram_user_id?: number | null;
          platform?: 'whatsapp' | 'telegram';
          name?: string | null;
          junction_user_id?: string | null;
          onboarding_complete?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      conversation_state: {
        Row: {
          id: string;
          user_id: string;
          state: string;
          context: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          state: string;
          context?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          state?: string;
          context?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      wearable_data: {
        Row: {
          id: string;
          user_id: string;
          junction_user_id: string;
          event_type: string;
          provider: string | null;
          payload: Json;
          received_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          junction_user_id: string;
          event_type: string;
          provider?: string | null;
          payload: Json;
          received_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          junction_user_id?: string;
          event_type?: string;
          provider?: string | null;
          payload?: Json;
          received_at?: string;
        };
      };
      daily_briefs: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          content: string;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          content: string;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          content?: string;
          sent_at?: string | null;
          created_at?: string;
        };
      };
    };
  };
}

export type DbUser = Database['public']['Tables']['users']['Row'];
export type DbUserInsert = Database['public']['Tables']['users']['Insert'];
export type DbUserUpdate = Database['public']['Tables']['users']['Update'];

export type DbConversationState = Database['public']['Tables']['conversation_state']['Row'];
export type DbConversationStateInsert = Database['public']['Tables']['conversation_state']['Insert'];
export type DbConversationStateUpdate = Database['public']['Tables']['conversation_state']['Update'];

export type DbWearableData = Database['public']['Tables']['wearable_data']['Row'];
export type DbWearableDataInsert = Database['public']['Tables']['wearable_data']['Insert'];

export type DbDailyBrief = Database['public']['Tables']['daily_briefs']['Row'];
export type DbDailyBriefInsert = Database['public']['Tables']['daily_briefs']['Insert'];
