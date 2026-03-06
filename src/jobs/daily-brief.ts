import { DateTime } from 'luxon';
import supabaseService from '../services/supabase';
import twilioService from '../services/twilio';
import telegramService from '../services/telegram';
import anthropicService from '../services/anthropic';
import { UserHealthData } from '../types/conversation';
import { DbUser } from '../types/database';
import logger from '../utils/logger';

export async function runDailyBrief(): Promise<void> {
  const startTime = Date.now();
  logger.info('Daily brief job started');

  try {
    const activeUsers = await supabaseService.getActiveUsers();

    if (activeUsers.length === 0) {
      logger.info('No active users found for daily brief');
      return;
    }

    logger.info('Processing daily briefs', { userCount: activeUsers.length });

    const results = await Promise.allSettled(
      activeUsers.map((user) => sendDailyBriefToUser(user))
    );

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    const duration = Date.now() - startTime;

    logger.info('Daily brief job completed', {
      totalUsers: activeUsers.length,
      successful,
      failed,
      duration: `${duration}ms`,
    });
  } catch (error: any) {
    logger.error('Daily brief job failed', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

async function sendDailyBriefToUser(user: DbUser): Promise<void> {
  const userId = user.id;
  const userName = user.name || 'there';
  const platform = user.platform || 'whatsapp';
  const userIdentifier = platform === 'telegram' ? user.telegram_user_id : user.phone_number;

  if (!userIdentifier) {
    logger.error('User missing identifier', { userId, platform });
    return;
  }

  try {
    logger.info('Generating daily brief for user', { userId, userName, platform });

    const today = DateTime.now().setZone('Europe/Stockholm').toISODate();
    if (!today) {
      throw new Error('Failed to get current date');
    }

    const existingBrief = await supabaseService.getBriefForDate(userId, today);
    if (existingBrief && existingBrief.sent_at) {
      logger.info('Daily brief already sent to user today', { userId, date: today });
      return;
    }

    const yesterday = DateTime.now().setZone('Europe/Stockholm').minus({ days: 1 }).toISODate();
    const sevenDaysAgo = DateTime.now().setZone('Europe/Stockholm').minus({ days: 7 }).toISODate();

    if (!yesterday || !sevenDaysAgo) {
      throw new Error('Failed to calculate date range');
    }

    const wearableData = await supabaseService.getWearableDataForUser(
      userId,
      sevenDaysAgo,
      yesterday
    );

    if (wearableData.length === 0) {
      logger.warn('No wearable data found for user', { userId });

      const noDataMessage = `Good morning, ${userName}! Your device didn't sync overnight. Make sure it's charged and connected so I can give you personalized insights tomorrow!`;

      // Send via appropriate platform
      if (platform === 'telegram') {
        await telegramService.sendMessage(userIdentifier as number, noDataMessage);
      } else {
        await twilioService.sendMessage(userIdentifier as string, noDataMessage);
      }

      await supabaseService.storeDailyBrief({
        user_id: userId,
        date: today,
        content: noDataMessage,
        sent_at: new Date().toISOString(),
      });

      logger.info('No-data message sent to user', { userId, platform });
      return;
    }

    const healthData: UserHealthData = {
      sleep: wearableData
        .filter((d) => d.event_type && d.event_type.includes('sleep'))
        .map((d) => d.payload as any)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 3),
      activity: wearableData
        .filter((d) => d.event_type && d.event_type.includes('activity'))
        .map((d) => d.payload as any)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 3),
      workouts: wearableData
        .filter((d) => d.event_type && d.event_type.includes('workout'))
        .map((d) => d.payload as any)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5),
    };

    const briefContent = await anthropicService.generateDailyBrief(userName, healthData);

    // Split into multiple messages for rapid-fire effect (platform-aware)
    const messages = anthropicService.splitIntoMessages(briefContent, platform);
    if (platform === 'telegram') {
      await telegramService.sendMultipleMessages(userIdentifier as number, messages);
    } else {
      await twilioService.sendMultipleMessages(userIdentifier as string, messages);
    }

    await supabaseService.storeDailyBrief({
      user_id: userId,
      date: today,
      content: briefContent,
      sent_at: new Date().toISOString(),
    });

    logger.info('Daily brief sent successfully', {
      userId,
      userName,
      platform,
      messageCount: messages.length,
      contentLength: briefContent.length,
    });
  } catch (error: any) {
    logger.error('Failed to send daily brief to user', {
      userId,
      userName,
      error: error.message,
      stack: error.stack,
    });

    try {
      await supabaseService.storeDailyBrief({
        user_id: userId,
        date: DateTime.now().setZone('Europe/Stockholm').toISODate() || '',
        content: `Error: ${error.message}`,
        sent_at: null,
      });
    } catch (saveError: any) {
      logger.error('Failed to save failed brief record', {
        userId,
        error: saveError.message,
      });
    }

    throw error;
  }
}
