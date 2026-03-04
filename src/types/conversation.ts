export type ConversationStateType =
  | 'new'
  | 'awaiting_name'
  | 'awaiting_connection'
  | 'active';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface StateContext {
  conversationHistory?: ConversationMessage[];
  linkToken?: string;
  connectionAttempts?: number;
  lastBriefDate?: string;
  [key: string]: any;
}

export interface ConversationState {
  id: string;
  userId: string;
  state: ConversationStateType;
  context: StateContext;
  createdAt: string;
  updatedAt: string;
}

export interface UserHealthData {
  sleep?: SleepData[];
  activity?: ActivityData[];
  vitals?: VitalsData[];
  workouts?: WorkoutData[];
}

export interface SleepData {
  date: string;
  duration: number;
  total: number;
  deep: number;
  rem: number;
  light: number;
  awake: number;
  efficiency: number;
  hrv_rmssd_avg?: number;
  hr_lowest?: number;
  hr_average?: number;
}

export interface ActivityData {
  date: string;
  steps: number;
  calories_total: number;
  calories_active: number;
  distance: number;
  active_duration: number;
  high_activity_minutes: number;
  medium_activity_minutes: number;
  low_activity_minutes: number;
}

export interface VitalsData {
  date: string;
  hr_avg?: number;
  hr_min?: number;
  hr_max?: number;
  hrv_avg?: number;
  respiratory_rate?: number;
}

export interface WorkoutData {
  date: string;
  title: string;
  sport: string;
  duration: number;
  distance: number;
  calories: number;
  average_hr?: number;
  max_hr?: number;
}
