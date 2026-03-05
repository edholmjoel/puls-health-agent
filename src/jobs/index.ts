import { CronJob } from 'cron';
import { runDailyBrief } from './daily-brief';
import { scheduledRemindersJob } from './scheduled-reminders';
import { staleDataCheckJob } from './stale-data-check';
import logger from '../utils/logger';

export function initializeJobs(): void {
  logger.info('Initializing scheduled jobs');

  const dailyBriefJob = new CronJob(
    '0 7 * * *',
    async () => {
      try {
        logger.info('Daily brief cron job triggered');
        await runDailyBrief();
      } catch (error: any) {
        logger.error('Daily brief cron job failed', {
          error: error.message,
          stack: error.stack,
        });
      }
    },
    null,
    true,
    'Europe/Stockholm'
  );

  logger.info('Daily brief job scheduled', {
    schedule: '0 7 * * *',
    timezone: 'Europe/Stockholm',
    nextRun: dailyBriefJob.nextDate().toISO(),
  });

  // Start scheduled reminders job
  scheduledRemindersJob.start();

  logger.info('Scheduled reminders job initialized', {
    schedule: '0 * * * *',
    timezone: 'Europe/Stockholm',
    nextRun: scheduledRemindersJob.nextDate().toISO(),
  });

  // Start stale data check job
  staleDataCheckJob.start();

  logger.info('Stale data check job initialized', {
    schedule: '0 */6 * * *',
    timezone: 'Europe/Stockholm',
    nextRun: staleDataCheckJob.nextDate().toISO(),
  });
}
