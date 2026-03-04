export interface JunctionUser {
  user_id: string;
  user_key: string;
  client_user_id: string;
  created_at: string;
}

export interface JunctionLinkToken {
  link_token: string;
}

export interface JunctionProvider {
  name: string;
  slug: string;
  logo: string;
}

export interface JunctionConnection {
  user_id: string;
  user_key: string;
  provider: JunctionProvider;
  status: 'active' | 'error' | 'paused';
  created_at: string;
  updated_at: string;
}

export interface JunctionWebhookEvent {
  event_type: string;
  team_id: string;
  client_user_id: string;
  user_id: string;
  data: Record<string, any>;
}

export interface ConnectionCreatedEvent extends JunctionWebhookEvent {
  event_type: 'provider.connection.created';
  data: {
    provider: JunctionProvider;
    status: string;
  };
}

export interface SleepDataEvent extends JunctionWebhookEvent {
  event_type: 'daily.data.sleep.created' | 'historical.data.sleep.created';
  data: {
    sleep: Array<{
      id: string;
      date: string;
      bedtime_start: string;
      bedtime_stop: string;
      timezone_offset: number;
      duration: number;
      total: number;
      awake: number;
      light: number;
      deep: number;
      rem: number;
      hr_lowest: number;
      hr_average: number;
      hrv_rmssd_avg: number;
      efficiency: number;
      latency: number;
      temperature_delta: number;
      average_hrv: number;
      respiratory_rate: number;
    }>;
  };
}

export interface ActivityDataEvent extends JunctionWebhookEvent {
  event_type: 'daily.data.activity.created' | 'historical.data.activity.created';
  data: {
    activity: Array<{
      id: string;
      date: string;
      calories_total: number;
      calories_active: number;
      steps: number;
      distance: number;
      floors_climbed: number;
      active_duration: number;
      high_activity_minutes: number;
      medium_activity_minutes: number;
      low_activity_minutes: number;
      sedentary_minutes: number;
    }>;
  };
}

export interface WorkoutDataEvent extends JunctionWebhookEvent {
  event_type: 'daily.data.workouts.created' | 'historical.data.workouts.created';
  data: {
    workouts: Array<{
      id: string;
      user_id: string;
      title: string;
      timezone_offset: number;
      average_hr: number;
      max_hr: number;
      distance: number;
      time_start: string;
      time_end: string;
      calories: number;
      sport: string;
      hr_zones: number[];
      moving_time: number;
      total_elevation_gain: number;
      elev_high: number;
      elev_low: number;
      average_speed: number;
      max_speed: number;
      average_watts: number;
      device_watts: number;
      max_watts: number;
      weighted_average_watts: number;
    }>;
  };
}

export interface BodyDataEvent extends JunctionWebhookEvent {
  event_type: 'daily.data.body.created' | 'historical.data.body.created';
  data: {
    body: Array<{
      id: string;
      date: string;
      weight: number;
      body_fat: number;
    }>;
  };
}

export type JunctionDataEvent =
  | SleepDataEvent
  | ActivityDataEvent
  | WorkoutDataEvent
  | BodyDataEvent;
