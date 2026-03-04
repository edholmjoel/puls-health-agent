import { CronJob } from 'cron';
import { runDailyBrief } from './daily-brief';
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
}
