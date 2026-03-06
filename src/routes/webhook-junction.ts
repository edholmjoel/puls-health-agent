import { Router, Request, Response } from 'express';
import express from 'express';
import junctionService from '../services/junction';
import supabaseService from '../services/supabase';
import twilioService from '../services/twilio';
import telegramService from '../services/telegram';
import notificationService from '../services/notifications';
import { dataAnalyzerService } from '../services/data-analyzer';
import anthropicService from '../services/anthropic';
import {
  JunctionWebhookEvent,
  ConnectionCreatedEvent,
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
  // Junction sends data in two formats:
  // 1. Aggregated summaries: { activity: [...], sleep: [...], workouts: [...] }
  // 2. Timeseries data: { data: [...], provider: {...}, source: {...} }
  let dataArray = (data as any)[dataType];

  // If not found under the data type key, check for generic "data" array (timeseries format)
  if (!Array.isArray(dataArray) && Array.isArray((data as any).data)) {
    dataArray = (data as any).data;
    logger.debug('Using generic data array for timeseries event', {
      requestId,
      eventType: event_type,
      dataType,
    });
  }

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

    // Analyze for proactive notifications (only for new data, not duplicates)
    if (storedCount > 0) {
      await analyzeForProactiveNotification(user, event_type, dataArray, requestId);
    }
  }
}

async function analyzeForProactiveNotification(
  user: any,
  eventType: string,
  dataArray: any[],
  requestId: string
): Promise<void> {
  try {
    // Only analyze daily data events (not historical bulk imports)
    if (!eventType.includes('daily.data')) {
      return;
    }

    // Analyze each new entry
    for (const entry of dataArray) {
      // Check for workouts
      if (eventType.includes('workout')) {
        const analysis = await notificationService.analyzeWorkout(user, entry);
        if (analysis.shouldNotify && analysis.message) {
          await notificationService.sendProactiveNotification(
            user,
            analysis.message,
            'workout'
          );
          logger.info('Proactive workout notification sent', {
            requestId,
            userId: user.id,
            workoutType: entry.sport,
          });
          // Only send one notification per webhook event
          break;
        }
      }

      // Check for significant data changes (sleep, activity)
      if (eventType.includes('sleep') || eventType.includes('activity')) {
        const analysis = await notificationService.analyzeDataForAlerts(
          user,
          eventType,
          entry
        );
        if (analysis.shouldNotify && analysis.message) {
          await notificationService.sendProactiveNotification(
            user,
            analysis.message,
            'data_alert'
          );
          logger.info('Proactive data alert sent', {
            requestId,
            userId: user.id,
            alertType: eventType,
          });
          // Only send one notification per webhook event
          break;
        }
      }
    }
  } catch (error: any) {
    logger.error('Error in proactive notification analysis', {
      requestId,
      userId: user.id,
      eventType,
      error: error.message,
    });
    // Don't throw - proactive notifications are non-critical
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

  // Mark user as active
  await supabaseService.updateUser(user.id, {
    onboarding_complete: true,
  });

  await supabaseService.updateConversationState(user.id, {
    state: 'active',
  });

  // Helper to send messages via appropriate platform
  const sendMessage = async (message: string) => {
    const platform = user.platform || 'whatsapp';
    if (platform === 'telegram' && user.telegram_user_id) {
      await telegramService.sendMessage(user.telegram_user_id, message);
    } else if (platform === 'whatsapp' && user.phone_number) {
      await twilioService.sendMessage(user.phone_number, message);
    } else {
      logger.warn('User missing identifier for sending message', {
        userId: user.id,
        platform,
      });
    }
  };

  try {
    logger.info('Fetching wearable data for onboarding', {
      userId: user.id,
    });

    // Fetch summary data (sleep, activity, workouts) - don't filter by date range yet
    // Junction sends all available historical data, so we want to capture it all
    const { data: wearableData, error: dataError } = await (supabaseService as any).client
      .from('wearable_data')
      .select('*')
      .eq('user_id', user.id)
      .or('event_type.ilike.%sleep.created,event_type.ilike.%activity.created,event_type.ilike.%workout%.created')
      .order('received_at', { ascending: false });

    if (dataError) {
      throw dataError;
    }

    if (!wearableData || wearableData.length === 0) {
      // No data yet - send friendly message and exit
      logger.info('No historical data available yet', { userId: user.id });
      await sendMessage(
        `Your ${provider} is connected! Give me a few minutes to sync your data, then I'll have some insights for you 👊`
      );
      return;
    }

    logger.info('Historical data fetched', {
      userId: user.id,
      dataPoints: wearableData.length,
    });

    // Analyze the data
    const insights = await dataAnalyzerService.generateOnboardingInsights(wearableData);

    if (!insights || insights.achievements.length === 0) {
      // No meaningful insights - fallback to generic message
      logger.info('No meaningful insights generated', { userId: user.id });
      await sendMessage(
        `Your ${provider} is connected! I'm looking at your data now - give me a moment to get familiar with your training 👀`
      );
      return;
    }

    // Generate opening hook (3-5 rapid-fire messages)
    const openingMessages = await anthropicService.generateOnboardingOpening(
      user.name || 'there',
      insights
    );

    logger.info('Generated onboarding opening', {
      userId: user.id,
      messageCount: openingMessages.length,
    });

    // Send opening messages with slight delays for rapid-fire feel
    for (let i = 0; i < openingMessages.length; i++) {
      await sendMessage(openingMessages[i]);
      // Small delay between messages (200-500ms) for natural texting feel
      if (i < openingMessages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
      }
    }

    // Update conversation state to track onboarding progress
    const conversationState = await supabaseService.getConversationState(user.id);
    const currentContext = (conversationState?.context as any) || {};
    await supabaseService.updateConversationState(user.id, {
      context: {
        ...currentContext,
        onboardingInsights: insights, // Store for later use
        onboardingPhase: 'question_1', // Track which question we asked
      } as any,
    });

    logger.info('User onboarding initiated', {
      requestId,
      userId: user.id,
      platform: user.platform,
      provider,
      achievementsCount: insights.achievements.length,
    });

    // Bot stops here and waits for user response
    // Next message from user will be handled by handleActiveConversation()

  } catch (error: any) {
    // Fallback to generic message if data analysis fails
    logger.error('Failed to generate personalized welcome', {
      requestId,
      userId: user.id,
      error: error.message,
      stack: error.stack,
    });

    await sendMessage(
      `Your ${provider} is connected! Give me a sec to check out your data...`
    );
  }
}

export default router;
