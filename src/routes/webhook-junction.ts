import { Router, Request, Response } from 'express';
import express from 'express';
import junctionService from '../services/junction';
import supabaseService from '../services/supabase';
import twilioService from '../services/twilio';
import {
  JunctionWebhookEvent,
  ConnectionCreatedEvent,
  SleepDataEvent,
  ActivityDataEvent,
  WorkoutDataEvent,
  BodyDataEvent,
} from '../types/junction';
import logger from '../utils/logger';
import { RequestWithId } from '../middleware/requestLogger';

const router = Router();

router.post(
  '/',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const requestId = (req as RequestWithId).id;

    try {
      const payload = req.body.toString('utf8');
      const headers = req.headers as Record<string, string>;

      logger.info('Junction webhook received', {
        requestId,
        headers: {
          'svix-id': headers['svix-id'],
          'svix-timestamp': headers['svix-timestamp'],
        },
      });

      const event = junctionService.verifyWebhook(payload, headers);

      logger.info('Processing Junction webhook event', {
        requestId,
        eventType: event.event_type,
        userId: event.user_id,
        clientUserId: event.client_user_id,
        eventData: JSON.stringify(event.data || {}).substring(0, 500),
      });

      await handleJunctionEvent(event, requestId);

      res.status(200).json({ received: true });
    } catch (error: any) {
      logger.error('Junction webhook processing failed', {
        requestId,
        error: error.message,
        stack: error.stack,
      });

      res.status(200).json({ received: true, error: error.message });
    }
  }
);

async function handleJunctionEvent(event: JunctionWebhookEvent, requestId: string): Promise<void> {
  const { event_type, user_id } = event;

  // Handle connection events separately
  if (event_type === 'provider.connection.created') {
    await handleConnectionCreated(event as ConnectionCreatedEvent, requestId);
    return;
  }

  // Handle all data events generically (daily.data.* or historical.data.*)
  if (event_type.includes('daily.data') || event_type.includes('historical.data')) {
    await handleGenericDataEvent(event, requestId);
    return;
  }

  // Log truly unhandled events (not data events)
  logger.info('Unhandled Junction event type', {
    requestId,
    eventType: event_type,
    userId: user_id,
  });
}

async function handleGenericDataEvent(event: JunctionWebhookEvent, requestId: string): Promise<void> {
  const { user_id, event_type, data } = event;

  const user = await supabaseService.getUserByJunctionId(user_id);
  if (!user) {
    logger.warn('User not found for data event', { requestId, userId: user_id, eventType: event_type });
    return;
  }

  if (!data || typeof data !== 'object') {
    logger.debug('No data object in event', { requestId, userId: user_id, eventType: event_type });
    return;
  }

  // Extract data type from event_type
  // e.g., "historical.data.sleep.created" -> "sleep"
  // e.g., "daily.data.activity.created" -> "activity"
  const parts = event_type.split('.');
  const dataTypeIndex = parts.findIndex(p => p === 'data') + 1;
  const dataType = parts[dataTypeIndex];

  if (!dataType) {
    logger.warn('Could not extract data type from event', { requestId, eventType: event_type });
    return;
  }

  // Look for the data array in the data object
  // Junction sends data like: { sleep: [...], activity: [...], etc }
  const dataArray = (data as any)[dataType];

  if (!Array.isArray(dataArray)) {
    logger.info('No array found for data type', {
      requestId,
      eventType: event_type,
      dataType,
      availableKeys: Object.keys(data)
    });
    return;
  }

  if (dataArray.length === 0) {
    logger.info('Empty data array for type', { requestId, eventType: event_type, dataType });
    return;
  }

  // Store each entry
  let storedCount = 0;
  let duplicateCount = 0;

  for (const entry of dataArray) {
    try {
      await supabaseService.storeWearableData({
        user_id: user.id,
        junction_user_id: user_id,
        event_type: event_type,
        payload: entry,
      });
      storedCount++;

      logger.info('Wearable data stored', {
        requestId,
        userId: user.id,
        dataType,
        entryId: entry.id,
        date: entry.date,
      });
    } catch (error: any) {
      if (error?.code === '23505') {
        duplicateCount++;
        logger.debug('Duplicate entry skipped', {
          requestId,
          dataType,
          entryId: entry.id,
        });
      } else {
        logger.error('Failed to store entry', {
          requestId,
          dataType,
          entryId: entry.id,
          error: error.message,
        });
        throw error;
      }
    }
  }

  if (storedCount > 0) {
    logger.info('Data event processed successfully', {
      requestId,
      eventType: event_type,
      dataType,
      storedCount,
      duplicateCount,
      totalReceived: dataArray.length,
    });
  }
}

async function handleConnectionCreated(
  event: ConnectionCreatedEvent,
  requestId: string
): Promise<void> {
  const { user_id, client_user_id, data } = event;
  const provider = data.provider.name;

  logger.info('Wearable connection created', {
    requestId,
    userId: user_id,
    clientUserId: client_user_id,
    provider,
  });

  const user = await supabaseService.getUserByJunctionId(user_id);
  if (!user) {
    logger.warn('User not found for connection event', { requestId, userId: user_id });
    return;
  }

  await supabaseService.updateUser(user.id, {
    onboarding_complete: true,
  });

  await supabaseService.updateConversationState(user.id, {
    state: 'active',
  });

  const confirmationMessage = `Your ${provider} is connected! I'll start analyzing your data and send you daily health briefs every morning at 7am. Feel free to ask me anything about your health and fitness!`;

  await twilioService.sendMessage(user.phone_number, confirmationMessage);

  logger.info('User onboarding completed', {
    requestId,
    userId: user.id,
    provider,
  });
}

async function handleSleepData(event: SleepDataEvent, requestId: string): Promise<void> {
  const { user_id, data } = event;

  const user = await supabaseService.getUserByJunctionId(user_id);
  if (!user) {
    logger.warn('User not found for sleep data event', { requestId, userId: user_id });
    return;
  }

  if (!data.sleep || data.sleep.length === 0) {
    logger.warn('No sleep data in event', { requestId, userId: user_id });
    return;
  }

  for (const sleepEntry of data.sleep) {
    try {
      await supabaseService.storeWearableData({
        user_id: user.id,
        junction_user_id: user_id,
        event_type: event.event_type,
        payload: sleepEntry,
      });

      logger.info('Sleep data stored', {
        requestId,
        userId: user.id,
        date: sleepEntry.date,
        duration: sleepEntry.duration,
      });
    } catch (error: any) {
      if (error?.code === '23505') {
        logger.debug('Duplicate sleep data entry skipped', {
          requestId,
          sleepId: sleepEntry.id,
        });
      } else {
        throw error;
      }
    }
  }
}

async function handleActivityData(event: ActivityDataEvent, requestId: string): Promise<void> {
  const { user_id, data } = event;

  const user = await supabaseService.getUserByJunctionId(user_id);
  if (!user) {
    logger.warn('User not found for activity data event', { requestId, userId: user_id });
    return;
  }

  if (!data.activity || data.activity.length === 0) {
    logger.warn('No activity data in event', { requestId, userId: user_id });
    return;
  }

  for (const activityEntry of data.activity) {
    try {
      await supabaseService.storeWearableData({
        user_id: user.id,
        junction_user_id: user_id,
        event_type: event.event_type,
        payload: activityEntry,
      });

      logger.info('Activity data stored', {
        requestId,
        userId: user.id,
        date: activityEntry.date,
        steps: activityEntry.steps,
      });
    } catch (error: any) {
      if (error?.code === '23505') {
        logger.debug('Duplicate activity data entry skipped', {
          requestId,
          activityId: activityEntry.id,
        });
      } else {
        throw error;
      }
    }
  }
}

async function handleWorkoutData(event: WorkoutDataEvent, requestId: string): Promise<void> {
  const { user_id, data } = event;

  const user = await supabaseService.getUserByJunctionId(user_id);
  if (!user) {
    logger.warn('User not found for workout data event', { requestId, userId: user_id });
    return;
  }

  if (!data.workouts || data.workouts.length === 0) {
    logger.warn('No workout data in event', { requestId, userId: user_id });
    return;
  }

  for (const workoutEntry of data.workouts) {
    try {
      await supabaseService.storeWearableData({
        user_id: user.id,
        junction_user_id: user_id,
        event_type: event.event_type,
        payload: workoutEntry,
      });

      logger.info('Workout data stored', {
        requestId,
        userId: user.id,
        sport: workoutEntry.sport,
        duration: workoutEntry.moving_time,
      });
    } catch (error: any) {
      if (error?.code === '23505') {
        logger.debug('Duplicate workout data entry skipped', {
          requestId,
          workoutId: workoutEntry.id,
        });
      } else {
        throw error;
      }
    }
  }
}

async function handleBodyData(event: BodyDataEvent, requestId: string): Promise<void> {
  const { user_id, data } = event;

  const user = await supabaseService.getUserByJunctionId(user_id);
  if (!user) {
    logger.warn('User not found for body data event', { requestId, userId: user_id });
    return;
  }

  if (!data.body || data.body.length === 0) {
    logger.warn('No body data in event', { requestId, userId: user_id });
    return;
  }

  for (const bodyEntry of data.body) {
    try {
      await supabaseService.storeWearableData({
        user_id: user.id,
        junction_user_id: user_id,
        event_type: event.event_type,
        payload: bodyEntry,
      });

      logger.info('Body data stored', {
        requestId,
        userId: user.id,
        date: bodyEntry.date,
        weight: bodyEntry.weight,
      });
    } catch (error: any) {
      if (error?.code === '23505') {
        logger.debug('Duplicate body data entry skipped', {
          requestId,
          bodyId: bodyEntry.id,
        });
      } else {
        throw error;
      }
    }
  }
}

export default router;
