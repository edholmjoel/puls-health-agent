import { WorkoutData } from './conversation';

export interface OnboardingInsights {
  achievements: string[]; // 3-5 impressive data points (ordered by impressiveness)
  fitnessLevel: string; // "beginner", "intermediate", "advanced", "elite"
  workoutStyle: string; // "endurance runner", "HIIT athlete", "cross-trainer", etc.
  sleepPattern: string; // "consistent 7h", "variable 6-8h", etc.
  recommendations: string[]; // What to focus on (optional, not used in opening)
}

export interface WorkoutAchievement {
  type: 'longest_duration' | 'longest_distance' | 'highest_intensity' | 'biggest_elevation';
  workout: WorkoutData;
  description: string; // Human-readable achievement
}

export interface FitnessAssessment {
  level: 'beginner' | 'intermediate' | 'advanced' | 'elite';
  indicators: string[]; // What led to this assessment
  confidence: number; // 0-1 confidence score
}
