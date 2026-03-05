import twilioService from './twilio';
import supabaseService from './supabase';
import { DbUser } from '../types/database';
import logger from '../utils/logger';

interface ProactiveNotification {
  shouldNotify: boolean;
  message?: string;
  type?: 'workout' | 'data_alert';
}

class NotificationService {
  private readonly MAX_PROACTIVE_PER_DAY = 3;
  private readonly MIN_HOURS_BETWEEN = 2;

  /**
   * Check if user can receive a proactive notification based on rate limiting
   */
  async canSendProactiveNotification(userId: string): Promise<boolean> {
    try {
      const conversationState = await supabaseService.getConversationState(userId);
      if (!conversationState) {
        return false;
      }

      const context = conversationState.context as any;
      const lastProactiveAt = context.last_proactive_at;
      const proactiveCount = context.proactive_count_today || 0;
      const proactiveDate = context.proactive_date;

      const now = new Date();
      const today = now.toISOString().split('T')[0];

      // Reset daily count if it's a new day
      if (proactiveDate !== today) {
        await supabaseService.updateConversationState(userId, {
          context: {
            ...context,
            proactive_count_today: 0,
            proactive_date: today,
          } as any,
        });
        return true;
      }

      // Check daily limit
      if (proactiveCount >= this.MAX_PROACTIVE_PER_DAY) {
        logger.info('Daily proactive notification limit reached', {
          userId,
          count: proactiveCount,
        });
        return false;
      }

      // Check time between notifications
      if (lastProactiveAt) {
        const lastProactiveTime = new Date(lastProactiveAt);
        const hoursSinceLast = (now.getTime() - lastProactiveTime.getTime()) / (1000 * 60 * 60);

        if (hoursSinceLast < this.MIN_HOURS_BETWEEN) {
          logger.info('Too soon since last proactive notification', {
            userId,
            hoursSinceLast,
            minRequired: this.MIN_HOURS_BETWEEN,
          });
          return false;
        }
      }

      return true;
    } catch (error: any) {
      logger.error('Error checking proactive notification eligibility', {
        userId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Send a proactive notification to the user
   */
  async sendProactiveNotification(
    user: DbUser,
    message: string,
    type: 'workout' | 'data_alert'
  ): Promise<void> {
    try {
      const canSend = await this.canSendProactiveNotification(user.id);
      if (!canSend) {
        logger.info('Skipping proactive notification due to rate limiting', {
          userId: user.id,
          type,
        });
        return;
      }

      // Send the notification
      await twilioService.sendMessage(user.phone_number, message);

      // Update conversation state
      const conversationState = await supabaseService.getConversationState(user.id);
      if (conversationState) {
        const context = conversationState.context as any;
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentCount = context.proactive_count_today || 0;

        await supabaseService.updateConversationState(user.id, {
          context: {
            ...context,
            last_proactive_at: now.toISOString(),
            proactive_count_today: currentCount + 1,
            proactive_date: today,
          } as any,
        });
      }

      logger.info('Proactive notification sent', {
        userId: user.id,
        type,
        messageLength: message.length,
      });
    } catch (error: any) {
      logger.error('Failed to send proactive notification', {
        userId: user.id,
        type,
        error: error.message,
      });
    }
  }

  /**
   * Analyze workout data and generate congratulatory message if appropriate
   */
  async analyzeWorkout(
    user: DbUser,
    workoutData: any
  ): Promise<ProactiveNotification> {
    try {
      const { sport, duration, distance, title } = workoutData;

      // Generate congratulatory message based on workout type
      let message = '';

      if (sport === 'running' || sport === 'run') {
        const distanceKm = distance ? (distance / 1000).toFixed(1) : null;
        const durationMins = duration ? Math.floor(duration / 60) : null;

        if (distanceKm && durationMins) {
          const paceMinPerKm = durationMins / parseFloat(distanceKm);
          message = `Yo! Just saw that ${distanceKm}km run 🏃‍♂️ ${durationMins} mins - ${paceMinPerKm.toFixed(1)} min/km pace. Solid work bro!`;
        } else if (durationMins) {
          message = `Nice ${durationMins} min run! 🏃‍♂️ Keep it up bro!`;
        }
      } else if (sport === 'cycling' || sport === 'bike') {
        const distanceKm = distance ? (distance / 1000).toFixed(1) : null;
        const durationMins = duration ? Math.floor(duration / 60) : null;

        if (distanceKm && durationMins) {
          message = `Sick ${distanceKm}km ride! 🚴 ${durationMins} mins in the saddle. Beast mode!`;
        } else if (durationMins) {
          message = `${durationMins} min bike session 🚴 Love it!`;
        }
      } else if (sport === 'strength_training' || sport === 'gym' || sport === 'weights') {
        const durationMins = duration ? Math.floor(duration / 60) : null;
        if (durationMins) {
          message = `${durationMins} min gym session 💪 Getting those gains!`;
        }
      } else if (sport === 'swimming' || sport === 'swim') {
        const durationMins = duration ? Math.floor(duration / 60) : null;
        const distanceM = distance || null;

        if (distanceM && durationMins) {
          message = `${distanceM}m swim in ${durationMins} mins 🏊‍♂️ Crushing it!`;
        } else if (durationMins) {
          message = `${durationMins} min swim session 🏊‍♂️ Nice!`;
        }
      } else {
        // Generic workout message
        const durationMins = duration ? Math.floor(duration / 60) : null;
        const workoutName = title || sport || 'workout';
        if (durationMins) {
          message = `Saw your ${workoutName} - ${durationMins} mins! 💪 Keep crushing it!`;
        }
      }

      if (message) {
        return {
          shouldNotify: true,
          message,
          type: 'workout',
        };
      }

      return { shouldNotify: false };
    } catch (error: any) {
      logger.error('Error analyzing workout', {
        userId: user.id,
        error: error.message,
      });
      return { shouldNotify: false };
    }
  }

  /**
   * Analyze health data for significant changes that warrant an alert
   */
  async analyzeDataForAlerts(
    user: DbUser,
    eventType: string,
    newData: any
  ): Promise<ProactiveNotification> {
    try {
      // Only analyze sleep and activity data for now
      if (!eventType.includes('sleep') && !eventType.includes('activity')) {
        return { shouldNotify: false };
      }

      // Get historical data for comparison (last 3 days)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 3);
      const historicalData = await supabaseService.getWearableDataForUser(
        user.id,
        startDate.toISOString()
      );

      // Filter to relevant data type
      const relevantData = historicalData.filter(d =>
        d.event_type === eventType &&
        d.payload &&
        (d.payload as any).date !== newData.date
      );

      if (relevantData.length < 2) {
        // Not enough historical data to establish baseline
        return { shouldNotify: false };
      }

      // Analyze sleep data
      if (eventType.includes('sleep')) {
        const avgHrv = relevantData.reduce((sum, d) => {
          const hrv = (d.payload as any).hrv_rmssd_avg || 0;
          return sum + hrv;
        }, 0) / relevantData.length;

        const avgEfficiency = relevantData.reduce((sum, d) => {
          const eff = (d.payload as any).efficiency || 0;
          return sum + eff;
        }, 0) / relevantData.length;

        const newHrv = newData.hrv_rmssd_avg || 0;
        const newEfficiency = newData.efficiency || 0;

        // Check for HRV drop >20%
        if (avgHrv > 0 && newHrv > 0) {
          const hrvDrop = ((avgHrv - newHrv) / avgHrv) * 100;
          if (hrvDrop > 20) {
            return {
              shouldNotify: true,
              message: `Heads up - your HRV dropped to ${newHrv.toFixed(0)}ms from your usual ${avgHrv.toFixed(0)}ms. Might be time for a recovery day 💤`,
              type: 'data_alert',
            };
          }
        }

        // Check for poor sleep efficiency
        if (avgEfficiency > 85 && newEfficiency < 70) {
          return {
            shouldNotify: true,
            message: `Your sleep efficiency was only ${newEfficiency.toFixed(0)}% last night (usually ${avgEfficiency.toFixed(0)}%). Everything ok? 😴`,
            type: 'data_alert',
          };
        }
      }

      // Analyze activity data
      if (eventType.includes('activity')) {
        const avgSteps = relevantData.reduce((sum, d) => {
          const steps = (d.payload as any).steps || 0;
          return sum + steps;
        }, 0) / relevantData.length;

        const newSteps = newData.steps || 0;

        // Check for unusually high activity (2x normal)
        if (avgSteps > 0 && newSteps > avgSteps * 2) {
          return {
            shouldNotify: true,
            message: `Damn! ${newSteps.toLocaleString()} steps today - that's 2x your usual! 🔥 What got you moving so much?`,
            type: 'data_alert',
          };
        }
      }

      return { shouldNotify: false };
    } catch (error: any) {
      logger.error('Error analyzing data for alerts', {
        userId: user.id,
        eventType,
        error: error.message,
      });
      return { shouldNotify: false };
    }
  }
}

export default new NotificationService();
