import { CronJob } from 'cron';
import supabaseService from '../services/supabase';
import twilioService from '../services/twilio';
import logger from '../utils/logger';

/**
 * Scheduled reminders job
 * Runs every hour to check for due reminders and sends them via WhatsApp
 */
export const scheduledRemindersJob = new CronJob(
  '0 * * * *', // Every hour at minute 0
  async () => {
    try {
      logger.info('Scheduled reminders job started');

      const now = new Date().toISOString();
      const reminders = await supabaseService.getScheduledReminders(now);

      if (reminders.length === 0) {
        logger.info('No scheduled reminders due', { checkedAt: now });
        return;
      }

      logger.info('Processing scheduled reminders', { count: reminders.length });

      let successCount = 0;
      let failureCount = 0;

      for (const reminder of reminders) {
        try {
          // Get user to find phone number
          const { data: user } = await (supabaseService as any).client
            .from('users')
            .select('phone_number, name')
            .eq('id', reminder.user_id)
            .single();

          if (!user || !user.phone_number) {
            logger.warn('User not found for reminder', {
              reminderId: reminder.id,
              userId: reminder.user_id,
            });
            failureCount++;
            continue;
          }

          // Format reminder message
          const message = `Yo ${user.name || 'bro'} 👋\n\nReminder: ${reminder.content}`;

          // Send via WhatsApp
          await twilioService.sendMessage(user.phone_number, message);

          // Mark as reminded
          await supabaseService.updateMemory(reminder.id, {
            reminded_at: new Date().toISOString(),
          });

          successCount++;

          logger.info('Scheduled reminder sent', {
            reminderId: reminder.id,
            userId: reminder.user_id,
            scheduledFor: reminder.scheduled_for,
          });
        } catch (error: any) {
          logger.error('Failed to send scheduled reminder', {
            reminderId: reminder.id,
            userId: reminder.user_id,
            error: error.message,
          });
          failureCount++;
        }
      }

      logger.info('Scheduled reminders job completed', {
        total: reminders.length,
        success: successCount,
        failed: failureCount,
      });
    } catch (error: any) {
      logger.error('Scheduled reminders job failed', {
        error: error.message,
        stack: error.stack,
      });
    }
  },
  null,
  false, // Don't start immediately
  'Europe/Stockholm'
);
