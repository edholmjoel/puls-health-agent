import supabaseService from './supabase';
import junctionService from './junction';
import anthropicService from './anthropic';
import { StateContext, UserHealthData, ConversationMessage } from '../types/conversation';
import { DbUser } from '../types/database';
import logger from '../utils/logger';
import { DateTime } from 'luxon';

/**
 * Message handler interface for platform-agnostic messaging
 * Adapters implement this interface for Twilio, Telegram, etc.
 */
export interface MessageHandler {
  sendMessage(to: string | number, text: string): Promise<void>;
  sendMultipleMessages(to: string | number, messages: string[]): Promise<void>;
}

/**
 * Handle awaiting_name state - user just provided their name
 */
export async function handleAwaitingName(
  userId: string,
  userIdentifier: string | number,
  name: string,
  context: StateContext,
  messageHandler: MessageHandler,
  requestId: string
): Promise<void> {
  const cleanName = name.trim();

  await supabaseService.updateUser(userId, { name: cleanName });

  logger.info('User name saved', {
    requestId,
    userId,
    name: cleanName,
  });

  let junctionUserId: string;

  try {
    // Convert telegram_user_id to string for Junction API
    const identifierString = String(userIdentifier);
    const junctionUser = await junctionService.createUser(identifierString);
    junctionUserId = junctionUser.user_id;
  } catch (error: any) {
    // If user already exists in Junction, extract the existing user_id from error
    if (error.message && error.message.includes('already exists')) {
      const existingUserId = error.message.match(/user_id['":][\s]*["']([^"']+)["']/)?.[1];
      if (existingUserId) {
        logger.info('Using existing Junction user', { userId, junctionUserId: existingUserId });
        junctionUserId = existingUserId;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  await supabaseService.updateUser(userId, {
    junction_user_id: junctionUserId,
  });

  const linkToken = await junctionService.getLinkToken(junctionUserId);

  const linkUrl = `https://link.tryvital.io/?token=${linkToken.link_token}&env=sandbox&region=eu`;

  await supabaseService.updateConversationState(userId, {
    state: 'awaiting_connection',
    context: {
      ...context,
      linkToken: linkToken.link_token,
      connectionAttempts: 0,
    } as any,
  });

  const message = `Nice to meet you, ${cleanName}! To get started, I need to connect to your wearable device (like Garmin, Fitbit, Oura, etc.).\n\nClick here to connect: ${linkUrl}\n\nOnce you've connected, send me a message saying "done"!`;

  await messageHandler.sendMessage(userIdentifier, message);

  logger.info('Connection link sent to user', {
    requestId,
    userId,
    junctionUserId,
  });
}

/**
 * Handle awaiting_connection state - waiting for user to connect wearable
 */
export async function handleAwaitingConnection(
  userId: string,
  userIdentifier: string | number,
  message: string,
  context: StateContext,
  messageHandler: MessageHandler,
  requestId: string
): Promise<void> {
  const lowerMessage = message.toLowerCase().trim();

  if (lowerMessage.includes('done') || lowerMessage.includes('connected') || lowerMessage.includes('ready')) {
    await messageHandler.sendMessage(
      userIdentifier,
      "Almost there! I'm syncing your data now. You'll receive a confirmation once everything is set up."
    );

    logger.info('User reported connection complete', {
      requestId,
      userId,
    });
  } else {
    const attempts = (context.connectionAttempts || 0) + 1;

    await supabaseService.updateConversationState(userId, {
      context: {
        ...context,
        connectionAttempts: attempts,
      } as any,
    });

    const linkUrl = context.linkToken
      ? `https://link.tryvital.io/?token=${context.linkToken}&env=sandbox&region=eu`
      : 'the link I sent you earlier';

    await messageHandler.sendMessage(
      userIdentifier,
      `No worries! Connect your wearable at ${linkUrl}, then send me a message saying "done" when you're ready.`
    );

    logger.info('Reminded user to connect wearable', {
      requestId,
      userId,
      attempts,
    });
  }
}

/**
 * Handle active conversation state - main AI conversation loop
 */
export async function handleActiveConversation(
  user: DbUser,
  userIdentifier: string | number,
  message: string,
  context: StateContext,
  messageHandler: MessageHandler,
  platform: 'whatsapp' | 'telegram',
  requestId: string
): Promise<void> {
  const lowerMessage = message.toLowerCase().trim();

  // Handle manual data refresh command
  if (lowerMessage.includes('refresh') || lowerMessage.includes('sync')) {
    if (!user.junction_user_id) {
      await messageHandler.sendMessage(
        userIdentifier,
        "Hmm, I don't have your wearable connected yet. Can't refresh data without it!"
      );
      return;
    }

    try {
      logger.info('Manual data refresh requested', {
        requestId,
        userId: user.id,
        junctionUserId: user.junction_user_id,
      });

      await junctionService.refreshUserData(user.junction_user_id);

      await messageHandler.sendMessage(
        userIdentifier,
        "Pulling your latest data from the wearable... give me 30 seconds and it'll be updated! 🔄"
      );

      logger.info('Data refresh triggered successfully', {
        requestId,
        userId: user.id,
      });

      return;
    } catch (error: any) {
      logger.error('Failed to trigger data refresh', {
        requestId,
        userId: user.id,
        error: error.message,
      });

      await messageHandler.sendMessage(
        userIdentifier,
        "Couldn't refresh your data right now. Try again in a minute!"
      );

      return;
    }
  }

  const conversationHistory: ConversationMessage[] = context.conversationHistory || [];

  const startDate = DateTime.now().minus({ days: 7 }).toISODate();
  const endDate = DateTime.now().toISODate();

  if (!startDate || !endDate) {
    logger.error('Failed to calculate date range', { requestId });
    return;
  }

  // Fetch wearable data
  let wearableData: any[] = [];
  try {
    wearableData = await supabaseService.getWearableDataForUser(user.id, startDate, endDate);
    logger.info('Fetched wearable data', {
      requestId,
      userId: user.id,
      recordCount: wearableData.length,
      dateRange: { startDate, endDate },
    });
  } catch (error: any) {
    logger.warn('Could not fetch wearable data, proceeding without it', {
      requestId,
      userId: user.id,
      error: error.message,
    });
  }

  const healthData: UserHealthData = {
    sleep: wearableData
      .filter((d) => d.event_type && d.event_type.includes('sleep'))
      .map((d) => d.payload as any)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    activity: wearableData
      .filter((d) => d.event_type && d.event_type.includes('activity'))
      .map((d) => d.payload as any)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    workouts: wearableData
      .filter((d) => d.event_type && d.event_type.includes('workout'))
      .map((d) => d.payload as any)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  };

  logger.info('Prepared health data for AI', {
    requestId,
    sleepCount: healthData.sleep?.length || 0,
    activityCount: healthData.activity?.length || 0,
    workoutsCount: healthData.workouts?.length || 0,
  });

  // Fetch user memories
  let memories: any[] = [];
  try {
    memories = await supabaseService.getActiveMemories(user.id, 20);
    logger.info('Fetched user memories', {
      requestId,
      userId: user.id,
      memoryCount: memories.length,
    });
  } catch (error: any) {
    logger.warn('Could not fetch memories, proceeding without them', {
      requestId,
      userId: user.id,
      error: error.message,
    });
  }

  let rawResponse: string;

  if (
    lowerMessage.includes('brief') ||
    lowerMessage.includes('today') ||
    lowerMessage.includes('status') ||
    lowerMessage.includes('how am i')
  ) {
    rawResponse = await anthropicService.generateDailyBrief(user.name || 'there', healthData);
    logger.info('Generated on-demand brief', { requestId, userId: user.id });
  } else {
    rawResponse = await anthropicService.generateResponse(conversationHistory, message, healthData, memories);
    logger.info('Generated conversational response', { requestId, userId: user.id });
  }

  // Extract memory commands from response
  const extracted = anthropicService.extractMemoryCommands(rawResponse);
  const response = extracted.cleanResponse;

  // Handle memory extract
  if (extracted.memoryExtract) {
    try {
      await supabaseService.storeMemory({
        user_id: user.id,
        memory_type: extracted.memoryExtract.type,
        content: extracted.memoryExtract.content,
        scheduled_for: extracted.memoryExtract.scheduledFor,
      });
      logger.info('Memory stored from conversation', {
        requestId,
        userId: user.id,
        type: extracted.memoryExtract.type,
        scheduled: !!extracted.memoryExtract.scheduledFor,
      });
    } catch (error: any) {
      logger.error('Failed to store memory', {
        requestId,
        userId: user.id,
        error: error.message,
      });
    }
  }

  // Handle list memories request
  if (extracted.listMemories) {
    let memoryList = '';
    if (memories.length === 0) {
      memoryList = "\n\nI don't have anything stored yet bro";
    } else {
      memoryList = "\n\nHere's what I remember:\n";
      for (const mem of memories) {
        memoryList += `- ${mem.content}\n`;
      }
    }
    // Split into multiple messages for rapid-fire effect (platform-aware)
    const messages = anthropicService.splitIntoMessages(response + memoryList, platform);
    await messageHandler.sendMultipleMessages(userIdentifier, messages);
  } else if (extracted.forgetMemory) {
    // Handle forget memory request
    try {
      const foundMemories = await supabaseService.searchMemories(user.id, extracted.forgetMemory.search);
      if (foundMemories.length > 0) {
        for (const mem of foundMemories) {
          await supabaseService.deleteMemory(mem.id);
        }
        const messages = anthropicService.splitIntoMessages(response + '\n\nAlright, forgot about that 👍', platform);
        await messageHandler.sendMultipleMessages(userIdentifier, messages);
        logger.info('Memories deleted', {
          requestId,
          userId: user.id,
          count: foundMemories.length,
        });
      } else {
        const messages = anthropicService.splitIntoMessages(response + "\n\nI don't think I had that stored anyway", platform);
        await messageHandler.sendMultipleMessages(userIdentifier, messages);
      }
    } catch (error: any) {
      logger.error('Failed to forget memory', {
        requestId,
        userId: user.id,
        error: error.message,
      });
      const messages = anthropicService.splitIntoMessages(response, platform);
      await messageHandler.sendMultipleMessages(userIdentifier, messages);
    }
  } else {
    // Normal response - split into multiple messages for rapid-fire effect (platform-aware)
    const messages = anthropicService.splitIntoMessages(response, platform);
    await messageHandler.sendMultipleMessages(userIdentifier, messages);
  }

  const updatedHistory: ConversationMessage[] = [
    ...conversationHistory.slice(-10),
    {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    },
    {
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
    },
  ];

  await supabaseService.updateConversationState(user.id, {
    context: {
      ...context,
      conversationHistory: updatedHistory,
      lastBriefDate: lowerMessage.includes('brief') ? DateTime.now().toISODate() : context.lastBriefDate,
    } as any,
  });

  logger.info('Active conversation handled', {
    requestId,
    userId: user.id,
    historyLength: updatedHistory.length,
  });
}
