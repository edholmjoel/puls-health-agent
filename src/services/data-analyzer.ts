import { OnboardingInsights } from '../types/onboarding';
import { DbWearableData } from '../types/database';
import { UserHealthData, WorkoutData, SleepData, ActivityData } from '../types/conversation';
import logger from '../utils/logger';

class DataAnalyzerService {
  /**
   * Main entry point: Generate onboarding insights from wearable data
   */
  async generateOnboardingInsights(
    wearableData: DbWearableData[]
  ): Promise<OnboardingInsights> {
    try {
      // Parse wearable data into structured categories
      const healthData = this.parseWearableData(wearableData);

      logger.info('Analyzing health data for onboarding', {
        sleepDays: healthData.sleep?.length || 0,
        activityDays: healthData.activity?.length || 0,
        workouts: healthData.workouts?.length || 0,
      });

      // Analyze each category
      const workoutInsights = await this.analyzeWorkouts(healthData.workouts || []);
      const sleepInsights = await this.analyzeSleep(healthData.sleep || []);
      const activityInsights = await this.analyzeActivity(healthData.activity || []);

      // Build achievements array (ordered by impressiveness)
      const achievements: string[] = [];

      // Add most impressive workout first (becomes the opening hook)
      if (workoutInsights.bestWorkout) {
        achievements.push(workoutInsights.bestWorkout);
      }

      // Add workout consistency if notable
      if (workoutInsights.consistency === 'very_consistent' && workoutInsights.frequencyDescription) {
        achievements.push(workoutInsights.frequencyDescription);
      }

      // Add sleep consistency if notable
      if (sleepInsights.isImpressive && sleepInsights.description) {
        achievements.push(sleepInsights.description);
      }

      // Add activity level if high
      if (activityInsights.isHighlyActive && activityInsights.description) {
        achievements.push(activityInsights.description);
      }

      // Add additional workout insights
      if (workoutInsights.varietyDescription) {
        achievements.push(workoutInsights.varietyDescription);
      }

      logger.info('Generated onboarding insights', {
        achievementsCount: achievements.length,
        fitnessLevel: workoutInsights.fitnessLevel,
        workoutStyle: workoutInsights.style,
      });

      return {
        achievements,
        fitnessLevel: workoutInsights.fitnessLevel,
        workoutStyle: workoutInsights.style,
        sleepPattern: sleepInsights.pattern,
        recommendations: [],
      };
    } catch (error) {
      logger.error('Error generating onboarding insights', { error });
      throw error;
    }
  }

  /**
   * Parse raw wearable data into structured health data categories
   */
  private parseWearableData(wearableData: DbWearableData[]): UserHealthData {
    const healthData: UserHealthData = {
      sleep: [],
      activity: [],
      workouts: [],
    };

    for (const item of wearableData) {
      const eventType = item.event_type || '';
      const payload = item.payload as any;

      if (eventType.includes('sleep.created') && payload) {
        healthData.sleep?.push({
          date: payload.calendar_date || payload.date || item.received_at.split('T')[0],
          duration: payload.total * 60 || 0, // Convert minutes to seconds
          total: payload.total * 60 || 0, // Convert minutes to seconds
          deep: payload.deep * 60 || 0, // Convert minutes to seconds
          rem: payload.rem * 60 || 0, // Convert minutes to seconds
          light: payload.light * 60 || 0, // Convert minutes to seconds
          awake: payload.awake * 60 || 0, // Convert minutes to seconds
          efficiency: payload.efficiency || 0,
          hrv_rmssd_avg: payload.hrv_rmssd_avg,
          hr_lowest: payload.hr_lowest,
          hr_average: payload.resting_heart_rate || payload.hr_average,
        });
      } else if (eventType.includes('activity.created') && payload) {
        // Handle both test data and real Garmin data structures
        const high = payload.high_activity_minutes || payload.high || 0;
        const medium = payload.medium_activity_minutes || payload.medium || 0;
        const low = payload.low_activity_minutes || payload.low || 0;

        healthData.activity?.push({
          date: payload.calendar_date || payload.date || item.received_at.split('T')[0],
          steps: payload.steps || 0,
          calories_total: payload.calories_total || 0,
          calories_active: payload.calories_active || 0,
          distance: payload.distance || 0,
          active_duration: (high + medium) * 60 || 0,
          high_activity_minutes: high,
          medium_activity_minutes: medium,
          low_activity_minutes: low,
        });
      } else if (eventType.includes('workout.created') && payload) {
        healthData.workouts?.push({
          date: payload.calendar_date || payload.date || item.received_at.split('T')[0],
          title: payload.title || 'Workout',
          sport: payload.sport || 'unknown',
          duration: payload.duration || payload.moving_time || 0,
          distance: payload.distance || 0,
          calories: payload.calories || 0,
          average_hr: payload.average_hr,
          max_hr: payload.max_hr,
        });
      }
    }

    return healthData;
  }

  /**
   * Analyze workouts to find achievements and patterns
   */
  private async analyzeWorkouts(workouts: WorkoutData[]): Promise<{
    bestWorkout: string | null;
    consistency: 'very_consistent' | 'consistent' | 'irregular';
    frequencyDescription: string | null;
    varietyDescription: string | null;
    fitnessLevel: string;
    style: string;
  }> {
    if (!workouts || workouts.length === 0) {
      return {
        bestWorkout: null,
        consistency: 'irregular',
        frequencyDescription: null,
        varietyDescription: null,
        fitnessLevel: 'beginner',
        style: 'getting started',
      };
    }

    // Find most impressive workout
    let bestWorkout = null;
    let longestDistance = 0;
    let longestDuration = 0;
    let highestHR = 0;

    for (const workout of workouts) {
      if (workout.distance > longestDistance) {
        longestDistance = workout.distance;
      }
      if (workout.duration > longestDuration) {
        longestDuration = workout.duration;
      }
      if (workout.max_hr && workout.max_hr > highestHR) {
        highestHR = workout.max_hr;
      }
    }

    // Generate best workout description
    const longestDistanceWorkout = workouts.find(w => w.distance === longestDistance);
    const longestDurationWorkout = workouts.find(w => w.duration === longestDuration);

    if (longestDistance > 15000) {
      // 15km+ is impressive
      const km = (longestDistance / 1000).toFixed(0);
      const sport = longestDistanceWorkout?.sport || 'run';
      bestWorkout = `That ${km}km ${sport} was beast mode 💪`;
    } else if (longestDistance > 7000) {
      // 7km+ is solid
      const km = (longestDistance / 1000).toFixed(0);
      const sport = longestDistanceWorkout?.sport || 'run';
      bestWorkout = `${km}km ${sport} with solid pacing - keeping it consistent`;
    } else if (longestDuration > 3600) {
      // 1hr+ workout
      const hours = (longestDuration / 3600).toFixed(1);
      const sport = longestDurationWorkout?.sport || 'workout';
      bestWorkout = `${hours}hr ${sport} - that's some serious work`;
    } else if (highestHR > 180) {
      bestWorkout = `Hit ${highestHR} max HR - intense work 🔥`;
    } else if (workouts.length > 0) {
      // Generic fallback
      const recentWorkout = workouts[workouts.length - 1];
      if (recentWorkout.distance > 1000) {
        const km = (recentWorkout.distance / 1000).toFixed(0);
        bestWorkout = `${km}km ${recentWorkout.sport} - nice work`;
      } else {
        bestWorkout = `That ${recentWorkout.sport} session - solid effort 👊`;
      }
    }

    // Calculate consistency (workouts per week)
    const dateRange = this.getDateRange(workouts.map(w => w.date));
    const weeks = dateRange / 7 || 1;
    const workoutsPerWeek = workouts.length / weeks;

    let consistency: 'very_consistent' | 'consistent' | 'irregular' = 'irregular';
    let frequencyDescription = null;

    if (workoutsPerWeek >= 5) {
      consistency = 'very_consistent';
      frequencyDescription = `${workouts.length} workouts in ${Math.round(weeks)} weeks - that's beast mode consistency`;
    } else if (workoutsPerWeek >= 3) {
      consistency = 'very_consistent';
      frequencyDescription = `${Math.round(workoutsPerWeek)} sessions/week - solid consistency`;
    } else if (workoutsPerWeek >= 2) {
      consistency = 'consistent';
    }

    // Detect sport variety
    const sports = new Set(workouts.map(w => w.sport));
    let varietyDescription = null;
    if (sports.size >= 3) {
      varietyDescription = `Mixing ${Array.from(sports).slice(0, 3).join(', ')} - smart cross-training`;
    } else if (sports.size === 2) {
      const sportList = Array.from(sports);
      varietyDescription = `Balancing ${sportList[0]} with ${sportList[1]}`;
    }

    // Determine fitness level
    let fitnessLevel = 'beginner';
    if (workoutsPerWeek >= 5 && longestDistance > 15000) {
      fitnessLevel = 'advanced';
    } else if (workoutsPerWeek >= 4 || longestDistance > 10000) {
      fitnessLevel = 'intermediate';
    } else if (workoutsPerWeek >= 2) {
      fitnessLevel = 'intermediate';
    }

    // Determine workout style
    let style = 'getting started';
    const dominantSport = this.getMostCommonSport(workouts);
    if (dominantSport === 'running' || dominantSport === 'cycling') {
      style = 'endurance athlete';
    } else if (sports.size >= 3) {
      style = 'cross-trainer';
    } else if (workoutsPerWeek >= 5) {
      style = 'high-volume trainer';
    } else {
      style = 'consistent exerciser';
    }

    return {
      bestWorkout,
      consistency,
      frequencyDescription,
      varietyDescription,
      fitnessLevel,
      style,
    };
  }

  /**
   * Analyze sleep data for patterns and quality
   */
  private async analyzeSleep(sleep: SleepData[]): Promise<{
    isImpressive: boolean;
    description: string | null;
    pattern: string;
  }> {
    if (!sleep || sleep.length === 0) {
      return {
        isImpressive: false,
        description: null,
        pattern: 'no data',
      };
    }

    // Calculate averages
    const avgDuration = sleep.reduce((sum, s) => sum + s.total, 0) / sleep.length;
    const avgEfficiency = sleep.reduce((sum, s) => sum + (s.efficiency || 0), 0) / sleep.length;
    const avgHRV = sleep
      .filter(s => s.hrv_rmssd_avg)
      .reduce((sum, s) => sum + (s.hrv_rmssd_avg || 0), 0) / sleep.filter(s => s.hrv_rmssd_avg).length;

    const avgHours = avgDuration / 3600;

    // Check consistency
    const sleepDurations = sleep.map(s => s.total / 3600);
    const variance = this.calculateVariance(sleepDurations);
    const isConsistent = variance < 1.5; // Less than 1.5hr variance

    let description = null;
    let isImpressive = false;

    // Generate description based on patterns
    if (avgHours >= 7 && avgEfficiency >= 90 && isConsistent) {
      description = `${avgHours.toFixed(1)}h sleep with ${avgEfficiency.toFixed(0)}% efficiency - recovery game is on point 💤`;
      isImpressive = true;
    } else if (avgHours >= 7 && isConsistent) {
      description = `Consistent ${avgHours.toFixed(1)}h sleep every night - dialing in that rest`;
      isImpressive = true;
    } else if (avgEfficiency >= 90) {
      description = `${avgEfficiency.toFixed(0)}% sleep efficiency - quality over quantity`;
      isImpressive = true;
    } else if (avgHRV >= 60) {
      description = `HRV at ${avgHRV.toFixed(0)}ms - body is recovering well`;
      isImpressive = true;
    }

    // Determine pattern
    let pattern = 'variable';
    if (isConsistent && avgHours >= 7) {
      pattern = `consistent ${avgHours.toFixed(0)}h`;
    } else if (isConsistent) {
      pattern = `consistent ${avgHours.toFixed(0)}h`;
    } else {
      pattern = `variable ${avgHours.toFixed(0)}h`;
    }

    return {
      isImpressive,
      description,
      pattern,
    };
  }

  /**
   * Analyze activity data for patterns
   */
  private async analyzeActivity(activity: ActivityData[]): Promise<{
    isHighlyActive: boolean;
    description: string | null;
  }> {
    if (!activity || activity.length === 0) {
      return {
        isHighlyActive: false,
        description: null,
      };
    }

    const avgSteps = activity.reduce((sum, a) => sum + a.steps, 0) / activity.length;

    let description = null;
    let isHighlyActive = false;

    if (avgSteps >= 12000) {
      description = `${Math.round(avgSteps / 1000)}k+ steps daily - NEAT is on point`;
      isHighlyActive = true;
    } else if (avgSteps >= 10000) {
      description = `${Math.round(avgSteps / 1000)}k steps daily - keeping that movement high`;
      isHighlyActive = true;
    }

    return {
      isHighlyActive,
      description,
    };
  }

  /**
   * Helper: Get date range in days
   */
  private getDateRange(dates: string[]): number {
    if (dates.length === 0) return 0;
    const sorted = dates.sort();
    const start = new Date(sorted[0]);
    const end = new Date(sorted[sorted.length - 1]);
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  }

  /**
   * Helper: Get most common sport
   */
  private getMostCommonSport(workouts: WorkoutData[]): string {
    const sportCounts: Record<string, number> = {};
    for (const workout of workouts) {
      sportCounts[workout.sport] = (sportCounts[workout.sport] || 0) + 1;
    }
    return Object.entries(sportCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
  }

  /**
   * Helper: Calculate variance
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length);
  }
}

export const dataAnalyzerService = new DataAnalyzerService();
