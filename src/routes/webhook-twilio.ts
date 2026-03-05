import { Router, Request, Response } from 'express';
import express from 'express';
import twilio from 'twilio';
const MessagingResponse = twilio.twiml.MessagingResponse;
import twilioService from '../services/twilio';
import supabaseService from '../services/supabase';
import junctionService from '../services/junction';
import anthropicService from '../services/anthropic';
import { TwilioWebhookPayload } from '../types/twilio';
import { ConversationMessage, StateContext, UserHealthData } from '../types/conversation';
import logger from '../utils/logger';
import { RequestWithId } from '../middleware/requestLogger';
import { DateTime } from 'luxon';

const router = Router();

router.post(
  '/',
  express.urlencoded({ extended: false }),
  async (req: Request, res: Response) => {
    const requestId = (req as RequestWithId).id;
    const payload = req.body as TwilioWebhookPayload;

    try {
      logger.info('Twilio webhook received', {
        requestId,
        from: payload.From,
        messageSid: payload.MessageSid,
        bodyLength: payload.Body?.length,
      });

      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const signature = req.headers['x-twilio-signature'] as string;

      if (!twilioService.validateRequest(url, req.body, signature)) {
        logger.warn('Invalid Twilio webhook signature', { requestId });
      }

      const phoneNumber = payload.From.replace('whatsapp:', '');
      const userMessage = payload.Body;

      await handleIncomingMessage(phoneNumber, userMessage, requestId);

      const twiml = new MessagingResponse();
      res.type('text/xml');
      res.send(twiml.toString());
    } catch (error: any) {
      logger.error('Twilio webhook processing failed', {
        requestId,
        error: error.message,
        stack: error.stack,
      });

      const twiml = new MessagingResponse();
      res.type('text/xml');
      res.send(twiml.toString());
    }
  }
);

async function handleIncomingMessage(
  phoneNumber: string,
  message: string,
  requestId: string
): Promise<void> {
  let user = await supabaseService.getUserByPhone(phoneNumber);

  if (!user) {
    user = await supabaseService.createUser({
      phone_number: phoneNumber,
      onboarding_complete: false,
    });

    await supabaseService.createConversationState({
      user_id: user.id,
      state: 'awaiting_name',
      context: {},
    });

    await twilioService.sendMessage(
      phoneNumber,
      "Hey! I'm Puls, your personal AI health coach. What's your name?"
    );

    logger.info('New user created and greeted', {
      requestId,
      userId: user.id,
      phoneNumber,
    });

    return;
  }

  let conversationState = await supabaseService.getConversationState(user.id);
  if (!conversationState) {
    logger.warn('Conversation state not found for existing user, creating it', {
      requestId,
      userId: user.id,
    });

    conversationState = await supabaseService.createConversationState({
      user_id: user.id,
      state: 'awaiting_name',
      context: {},
    });

    await twilioService.sendMessage(
      phoneNumber,
      "Hey! I'm Puls, your personal AI health coach. What's your name?"
    );

    logger.info('Conversation state created for existing user', {
      requestId,
      userId: user.id,
    });

    return;
  }

  const currentState = conversationState.state;
  const context = (conversationState.context as StateContext) || {};

  logger.info('Processing message for user', {
    requestId,
    userId: user.id,
    state: currentState,
    message: message.substring(0, 50),
  });

  if (currentState === 'awaiting_name') {
    await handleAwaitingName(user.id, phoneNumber, message, context, requestId);
  } else if (currentState === 'awaiting_connection') {
    await handleAwaitingConnection(user.id, phoneNumber, message, context, requestId);
  } else if (currentState === 'active') {
    await handleActiveConversation(user, phoneNumber, message, context, requestId);
  } else {
    logger.warn('Unknown conversation state', {
      requestId,
      userId: user.id,
      state: currentState,
    });
  }
}

async function handleAwaitingName(
  userId: string,
  phoneNumber: string,
  name: string,
  context: StateContext,
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
    const junctionUser = await junctionService.createUser(phoneNumber);
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

  await twilioService.sendMessage(phoneNumber, message);

  logger.info('Connection link sent to user', {
    requestId,
    userId,
    junctionUserId,
  });
}

async function handleAwaitingConnection(
  userId: string,
  phoneNumber: string,
  message: string,
  context: StateContext,
  requestId: string
): Promise<void> {
  const lowerMessage = message.toLowerCase().trim();

  if (lowerMessage.includes('done') || lowerMessage.includes('connected') || lowerMessage.includes('ready')) {
    await twilioService.sendMessage(
      phoneNumber,
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
      ? `https://link.eu.tryvital.io/?token=${context.linkToken}`
      : 'the link I sent you earlier';

    await twilioService.sendMessage(
      phoneNumber,
      `No worries! Connect your wearable at ${linkUrl}, then send me a message saying "done" when you're ready.`
    );

    logger.info('Reminded user to connect wearable', {
      requestId,
      userId,
      attempts,
    });
  }
}

async function handleActiveConversation(
  user: any,
  phoneNumber: string,
  message: string,
  context: StateContext,
  requestId: string
): Promise<void> {
  const lowerMessage = message.toLowerCase().trim();

  // Handle manual data refresh command
  if (lowerMessage.includes('refresh') || lowerMessage.includes('sync')) {
    if (!user.junction_user_id) {
      await twilioService.sendMessage(
        phoneNumber,
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

      await twilioService.sendMessage(
        phoneNumber,
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

      await twilioService.sendMessage(
        phoneNumber,
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
      dateRange: { startDate, endDate }
    });
  } catch (error: any) {
    logger.warn('Could not fetch wearable data, proceeding without it', {
      requestId,
      userId: user.id,
      error: error.message
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
    workoutsCount: healthData.workouts?.length || 0
  });

  // Fetch user memories
  let memories: any[] = [];
  try {
    memories = await supabaseService.getActiveMemories(user.id, 20);
    logger.info('Fetched user memories', {
      requestId,
      userId: user.id,
      memoryCount: memories.length
    });
  } catch (error: any) {
    logger.warn('Could not fetch memories, proceeding without them', {
      requestId,
      userId: user.id,
      error: error.message
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
        scheduled: !!extracted.memoryExtract.scheduledFor
      });
    } catch (error: any) {
      logger.error('Failed to store memory', {
        requestId,
        userId: user.id,
        error: error.message
      });
    }
  }

  // Handle list memories request
  if (extracted.listMemories) {
    let memoryList = '';
    if (memories.length === 0) {
      memoryList = '\n\nI don\'t have anything stored yet bro';
    } else {
      memoryList = '\n\nHere\'s what I remember:\n';
      for (const mem of memories) {
        memoryList += `- ${mem.content}\n`;
      }
    }
    // Split into multiple messages for rapid-fire effect
    const messages = anthropicService.splitIntoMessages(response + memoryList);
    await twilioService.sendMultipleMessages(phoneNumber, messages);
  } else if (extracted.forgetMemory) {
    // Handle forget memory request
    try {
      const foundMemories = await supabaseService.searchMemories(user.id, extracted.forgetMemory.search);
      if (foundMemories.length > 0) {
        for (const mem of foundMemories) {
          await supabaseService.deleteMemory(mem.id);
        }
        const messages = anthropicService.splitIntoMessages(response + '\n\nAlright, forgot about that 👍');
        await twilioService.sendMultipleMessages(phoneNumber, messages);
        logger.info('Memories deleted', {
          requestId,
          userId: user.id,
          count: foundMemories.length
        });
      } else {
        const messages = anthropicService.splitIntoMessages(response + '\n\nI don\'t think I had that stored anyway');
        await twilioService.sendMultipleMessages(phoneNumber, messages);
      }
    } catch (error: any) {
      logger.error('Failed to forget memory', {
        requestId,
        userId: user.id,
        error: error.message
      });
      const messages = anthropicService.splitIntoMessages(response);
      await twilioService.sendMultipleMessages(phoneNumber, messages);
    }
  } else {
    // Normal response - split into multiple messages for rapid-fire effect
    const messages = anthropicService.splitIntoMessages(response);
    await twilioService.sendMultipleMessages(phoneNumber, messages);
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

export default router;
