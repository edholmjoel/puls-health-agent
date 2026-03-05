import { CronJob } from 'cron';
import supabaseService from '../services/supabase';
import twilioService from '../services/twilio';
import logger from '../utils/logger';

/**
 * Check for users with stale wearable data and send reminders
 */
export async function checkStaleData(): Promise<void> {
  try {
    logger.info('Starting stale data check');

    const users = await supabaseService.getActiveUsers();

    if (users.length === 0) {
      logger.info('No active users to check for stale data');
      return;
    }

    logger.info('Checking stale data for users', { userCount: users.length });

    for (const user of users) {
      try {
        // Get the most recent wearable data for this user
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentData = await supabaseService.getWearableDataForUser(
          user.id,
          sevenDaysAgo.toISOString()
        );

        if (recentData.length === 0) {
          // No data at all in the last 7 days - definitely stale
          logger.warn('User has no wearable data in last 7 days', {
            userId: user.id,
            phoneNumber: user.phone_number,
          });

          await twilioService.sendMessage(
            user.phone_number,
            "Haven't seen any data from your wearable in over a week! Make sure it's synced with your phone and connected to the internet."
          );

          logger.info('Stale data notification sent', {
            userId: user.id,
            daysSinceData: '7+',
          });
          continue;
        }

        // Find the most recent data timestamp
        const latestDataTimestamp = recentData.reduce((latest, data) => {
          const dataTime = new Date(data.received_at).getTime();
          return dataTime > latest ? dataTime : latest;
        }, 0);

        if (latestDataTimestamp === 0) {
          continue;
        }

        const hoursSinceLastSync = (Date.now() - latestDataTimestamp) / (1000 * 60 * 60);

        // Alert if more than 24 hours since last sync
        if (hoursSinceLastSync > 24) {
          const hoursSince = Math.floor(hoursSinceLastSync);

          logger.info('Stale data detected for user', {
            userId: user.id,
            phoneNumber: user.phone_number,
            hoursSinceLastSync: hoursSince,
          });

          await twilioService.sendMessage(
            user.phone_number,
            `Haven't seen data from your wearable in ${hoursSince}h. Make sure it's synced with your phone!`
          );

          logger.info('Stale data notification sent', {
            userId: user.id,
            hoursSinceSync: hoursSince,
          });
        }
      } catch (error: any) {
        logger.error('Error checking stale data for user', {
          userId: user.id,
          error: error.message,
        });
        // Continue with next user
      }
    }

    logger.info('Stale data check completed');
  } catch (error: any) {
    logger.error('Stale data check job failed', {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Cron job that runs every 6 hours to check for stale wearable data
 */
export const staleDataCheckJob = new CronJob(
  '0 */6 * * *', // Every 6 hours at minute 0
  async () => {
    try {
      logger.info('Stale data check cron job triggered');
      await checkStaleData();
    } catch (error: any) {
      logger.error('Stale data check cron job failed', {
        error: error.message,
        stack: error.stack,
      });
    }
  },
  null,
  false, // Don't start automatically - will be started in initializeJobs
  'Europe/Stockholm'
);
