import { Router, Request, Response } from 'express';
import express from 'express';
import telegramService from '../services/telegram';
import supabaseService from '../services/supabase';
import { TelegramUpdate } from '../types/telegram';
import { StateContext } from '../types/conversation';
import {
  handleAwaitingName,
  handleAwaitingConnection,
  handleActiveConversation,
  MessageHandler,
} from '../services/conversation-handler';
import logger from '../utils/logger';
import { RequestWithId } from '../middleware/requestLogger';

const router = Router();

router.post('/', express.json(), async (req: Request, res: Response): Promise<any> => {
  const requestId = (req as RequestWithId).id;
  const update = req.body as TelegramUpdate;

  try {
    logger.info('Telegram webhook received', {
      requestId,
      updateId: update.update_id,
      hasMessage: !!update.message,
    });

    // Only process text messages
    if (!update.message || !update.message.text || !update.message.from) {
      logger.debug('Ignoring non-text message', { requestId });
      return res.json({ ok: true });
    }

    const telegramUserId = update.message.from.id;
    const userMessage = update.message.text;
    const chatId = update.message.chat.id;

    await handleIncomingMessage(telegramUserId, chatId, userMessage, requestId);

    return res.json({ ok: true });
  } catch (error: any) {
    logger.error('Telegram webhook processing failed', {
      requestId,
      error: error.message,
      stack: error.stack,
    });

    // Always return 200 to Telegram to avoid retries
    return res.json({ ok: true });
  }
});

async function handleIncomingMessage(
  telegramUserId: number,
  chatId: number,
  message: string,
  requestId: string
): Promise<void> {
  let user = await supabaseService.getUserByTelegramId(telegramUserId);

  if (!user) {
    // Create new user for Telegram
    user = await supabaseService.createUser({
      telegram_user_id: telegramUserId,
      platform: 'telegram',
      onboarding_complete: false,
    });

    await supabaseService.createConversationState({
      user_id: user.id,
      state: 'awaiting_name',
      context: {},
    });

    await telegramService.sendMessage(
      chatId,
      "Hey! I'm Puls, your personal AI health coach. What's your name?"
    );

    logger.info('New Telegram user created and greeted', {
      requestId,
      userId: user.id,
      telegramUserId,
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

    await telegramService.sendMessage(
      chatId,
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

  logger.info('Processing message for Telegram user', {
    requestId,
    userId: user.id,
    state: currentState,
    message: message.substring(0, 50),
  });

  // Create messaging adapter for Telegram
  const messagingAdapter: MessageHandler = {
    sendMessage: async (to: string | number, text: string) => {
      await telegramService.sendMessage(Number(to), text);
    },
    sendMultipleMessages: async (to: string | number, messages: string[]) => {
      await telegramService.sendMultipleMessages(Number(to), messages);
    },
  };

  // Route to appropriate handler based on conversation state
  if (currentState === 'awaiting_name') {
    await handleAwaitingName(user.id, chatId, message, context, messagingAdapter, requestId);
  } else if (currentState === 'awaiting_connection') {
    await handleAwaitingConnection(user.id, chatId, message, context, messagingAdapter, requestId);
  } else if (currentState === 'active') {
    await handleActiveConversation(user, chatId, message, context, messagingAdapter, 'telegram', requestId);
  } else {
    logger.warn('Unknown conversation state', {
      requestId,
      userId: user.id,
      state: currentState,
    });
  }
}

export default router;
