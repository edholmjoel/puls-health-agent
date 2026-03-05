import dotenv from 'dotenv';
dotenv.config();

import 'express-async-errors';
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import junctionWebhookRouter from './routes/webhook-junction';
import twilioWebhookRouter from './routes/webhook-twilio';
import { initializeJobs } from './jobs';
import logger from './utils/logger';
import supabaseService from './services/supabase';
import junctionService from './services/junction';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(requestLogger);

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Test endpoint to trigger historical data resync
app.post('/test/resync-historical', express.json(), async (req: Request, res: Response): Promise<any> => {
  try {
    const { provider = 'garmin' } = req.body;
    const user = await supabaseService.getUserByPhone('+46766334597');
    if (!user || !user.junction_user_id) {
      return res.status(404).json({ error: 'User not found or no junction_user_id' });
    }

    logger.info('Triggering historical data resync', {
      userId: user.id,
      junctionUserId: user.junction_user_id,
      provider
    });

    const result = await junctionService.triggerHistoricalPull(
      [user.junction_user_id],
      provider
    );

    logger.info('Historical pull triggered', { result });

    res.json({
      success: true,
      message: 'Historical data resync triggered - webhooks will arrive shortly',
      provider,
      result
    });
  } catch (error: any) {
    logger.error('Failed to trigger historical pull', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to trigger Junction data refresh
app.post('/test/refresh-junction', express.json(), async (_req: Request, res: Response): Promise<any> => {
  try {
    const user = await supabaseService.getUserByPhone('+46766334597');
    if (!user || !user.junction_user_id) {
      return res.status(404).json({ error: 'User not found or no junction_user_id' });
    }

    logger.info('Triggering Junction data refresh', {
      userId: user.id,
      junctionUserId: user.junction_user_id
    });

    const refreshResult = await junctionService.refreshUserData(user.junction_user_id);

    logger.info('Junction refresh triggered', { refreshResult });

    res.json({
      success: true,
      message: 'Data refresh triggered',
      result: refreshResult
    });
  } catch (error: any) {
    logger.error('Failed to trigger refresh', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to check wearable data count
app.get('/test/check-data', async (_req: Request, res: Response): Promise<any> => {
  try {
    const user = await supabaseService.getUserByPhone('+46766334597');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const data = await supabaseService.getWearableDataForUser(user.id, startDate);

    res.json({
      totalRecords: data.length,
      latestRecords: data.slice(0, 3).map(r => ({
        event_type: r.event_type,
        date: (r.payload as any)?.date,
        received_at: r.received_at
      }))
    });
  } catch (error: any) {
    logger.error('Failed to check data', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to store mock wearable data (bypass webhook verification)
app.post('/test/store-data', express.json(), async (req: Request, res: Response): Promise<any> => {
  try {
    const { days = 5 } = req.body;
    const user = await supabaseService.getUserByPhone('+46766334597');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let totalStored = 0;

    // Generate data for the last N days
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      // Sleep data - vary it a bit each day
      const sleepData = {
        id: `mock-sleep-${dateStr}`,
        date: dateStr,
        total: 420 + (Math.random() * 60 - 30), // 6.5-7.5 hours
        deep: 80 + (Math.random() * 20 - 10),   // 1.2-1.5 hours
        rem: 110 + (Math.random() * 20 - 10),   // 1.7-2 hours
        light: 200 + (Math.random() * 40 - 20), // 3-4 hours
        awake: 25 + (Math.random() * 10),       // 25-35 mins
        efficiency: 88 + (Math.random() * 8),    // 88-96%
        hrv_rmssd_avg: 40 + (Math.random() * 15), // 40-55ms
        resting_heart_rate: 55 + (Math.random() * 8), // 55-63 bpm
      };

      // Activity data
      const activityData = {
        id: `mock-activity-${dateStr}`,
        date: dateStr,
        steps: 8000 + Math.floor(Math.random() * 4000), // 8k-12k steps
        calories_total: 2200 + Math.floor(Math.random() * 400), // 2200-2600 cal
        calories_active: 400 + Math.floor(Math.random() * 200), // 400-600 cal
        high_activity_minutes: 15 + Math.floor(Math.random() * 20), // 15-35 mins
        medium_activity_minutes: 30 + Math.floor(Math.random() * 30), // 30-60 mins
        distance: 6000 + Math.floor(Math.random() * 3000), // 6-9 km in meters
      };

      // Workout data (every other day)
      if (i % 2 === 0) {
        const workoutData = {
          id: `mock-workout-${dateStr}`,
          date: dateStr,
          title: i % 4 === 0 ? 'Morning Run' : 'Gym Session',
          sport: i % 4 === 0 ? 'running' : 'strength_training',
          duration: 2400 + Math.floor(Math.random() * 1200), // 40-60 mins in seconds
          moving_time: 2200 + Math.floor(Math.random() * 1000),
          distance: i % 4 === 0 ? 5000 + Math.floor(Math.random() * 3000) : undefined,
          calories: 350 + Math.floor(Math.random() * 150),
          average_hr: 145 + Math.floor(Math.random() * 15),
          max_hr: 170 + Math.floor(Math.random() * 15),
        };

        try {
          await supabaseService.storeWearableData({
            user_id: user.id,
            junction_user_id: user.junction_user_id!,
            event_type: 'daily.data.workouts.created',
            payload: workoutData,
          });
          totalStored++;
        } catch (error: any) {
          if (error?.code !== '23505') throw error;
        }
      }

      // Store sleep and activity
      try {
        await supabaseService.storeWearableData({
          user_id: user.id,
          junction_user_id: user.junction_user_id!,
          event_type: 'daily.data.sleep.created',
          payload: sleepData,
        });
        totalStored++;
      } catch (error: any) {
        if (error?.code !== '23505') throw error;
      }

      try {
        await supabaseService.storeWearableData({
          user_id: user.id,
          junction_user_id: user.junction_user_id!,
          event_type: 'daily.data.activity.created',
          payload: activityData,
        });
        totalStored++;
      } catch (error: any) {
        if (error?.code !== '23505') throw error;
      }
    }

    logger.info('Mock test data generated', { userId: user.id, days, totalStored });

    res.json({
      success: true,
      message: `Generated ${days} days of mock data`,
      recordsStored: totalStored
    });
  } catch (error: any) {
    logger.error('Failed to store test data', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to manually sync historical data
app.post('/test/sync-data', express.json(), async (req: Request, res: Response): Promise<any> => {
  try {
    const { phoneNumber, startDate: customStartDate, endDate: customEndDate } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber required' });
    }

    const user = await supabaseService.getUserByPhone(phoneNumber);
    if (!user || !user.junction_user_id) {
      return res.status(404).json({ error: 'User not found or no junction_user_id' });
    }

    // Use custom dates if provided, otherwise default to last 7 days
    const endDate = customEndDate || new Date().toISOString().split('T')[0];
    const startDate = customStartDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    logger.info('Manually syncing data for user', {
      userId: user.id,
      junctionUserId: user.junction_user_id,
      startDate,
      endDate
    });

    let totalRecords = 0;

    // Fetch sleep data
    try {
      const sleepData = await junctionService.getSleepSummary(user.junction_user_id, startDate, endDate);
      logger.info('Sleep data fetched from Junction', { sleepData: JSON.stringify(sleepData).substring(0, 500) });
      if (sleepData.sleep && sleepData.sleep.length > 0) {
        for (const sleepEntry of sleepData.sleep) {
          try {
            await supabaseService.storeWearableData({
              user_id: user.id,
              junction_user_id: user.junction_user_id,
              event_type: 'daily.data.sleep.created',
              payload: sleepEntry,
            });
            totalRecords++;
          } catch (err: any) {
            if (err?.code !== '23505') {
              logger.warn('Failed to store sleep entry', { error: err.message });
            }
          }
        }
        logger.info('Sleep data synced', { count: sleepData.sleep.length });
      }
    } catch (error: any) {
      logger.warn('Failed to sync sleep data', { error: error.message });
    }

    // Fetch activity data
    try {
      const activityData = await junctionService.getActivitySummary(user.junction_user_id, startDate, endDate);
      if (activityData.activity && activityData.activity.length > 0) {
        for (const activityEntry of activityData.activity) {
          try {
            await supabaseService.storeWearableData({
              user_id: user.id,
              junction_user_id: user.junction_user_id,
              event_type: 'daily.data.activity.created',
              payload: activityEntry,
            });
            totalRecords++;
          } catch (err: any) {
            if (err?.code !== '23505') {
              logger.warn('Failed to store activity entry', { error: err.message });
            }
          }
        }
        logger.info('Activity data synced', { count: activityData.activity.length });
      }
    } catch (error: any) {
      logger.warn('Failed to sync activity data', { error: error.message });
    }

    // Fetch workout data
    try {
      const workoutData = await junctionService.getWorkoutsSummary(user.junction_user_id, startDate, endDate);
      if (workoutData.workouts && workoutData.workouts.length > 0) {
        for (const workoutEntry of workoutData.workouts) {
          try {
            await supabaseService.storeWearableData({
              user_id: user.id,
              junction_user_id: user.junction_user_id,
              event_type: 'daily.data.workouts.created',
              payload: workoutEntry,
            });
            totalRecords++;
          } catch (err: any) {
            if (err?.code !== '23505') {
              logger.warn('Failed to store workout entry', { error: err.message });
            }
          }
        }
        logger.info('Workout data synced', { count: workoutData.workouts.length });
      }
    } catch (error: any) {
      logger.warn('Failed to sync workout data', { error: error.message });
    }

    res.json({
      success: true,
      message: 'Data sync completed',
      recordsStored: totalRecords
    });
  } catch (error: any) {
    logger.error('Manual sync failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.use('/webhooks/junction', junctionWebhookRouter);
app.use('/webhooks/twilio', twilioWebhookRouter);

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Puls Health Agent',
    version: '1.0.0',
    description: 'AI health coaching agent via WhatsApp',
    endpoints: {
      health: '/health',
      webhooks: {
        junction: '/webhooks/junction',
        twilio: '/webhooks/twilio',
      },
    },
  });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found',
  });
});

app.use(errorHandler);

function startServer(): void {
  try {
    logger.info('Starting Puls Health Agent server');

    initializeJobs();

    app.listen(PORT, () => {
      logger.info('Server started successfully', {
        port: PORT,
        nodeEnv: process.env.NODE_ENV || 'development',
      });

      logger.info('Available endpoints', {
        health: `/health`,
        junctionWebhook: `/webhooks/junction`,
        twilioWebhook: `/webhooks/twilio`,
      });
    });
  } catch (error: any) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
  });
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();
