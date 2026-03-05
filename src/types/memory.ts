// Types for user memory bank feature

export type MemoryType = 'fact' | 'preference' | 'goal' | 'reminder';

export interface DbMemory {
  id: string;
  user_id: string;
  memory_type: MemoryType;
  content: string;
  context?: Record<string, any>;
  scheduled_for?: string;
  reminded_at?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface DbMemoryInsert {
  user_id: string;
  memory_type: MemoryType;
  content: string;
  context?: Record<string, any>;
  scheduled_for?: string;
}

export interface DbMemoryUpdate {
  memory_type?: MemoryType;
  content?: string;
  context?: Record<string, any>;
  scheduled_for?: string;
  reminded_at?: string;
  deleted_at?: string;
}

export interface MemoryExtractionResult {
  shouldStore: boolean;
  memories: Array<{
    type: MemoryType;
    content: string;
    scheduledFor?: string;
  }>;
}
