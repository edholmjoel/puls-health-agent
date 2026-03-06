import '../config';
import Anthropic from '@anthropic-ai/sdk';
import { UserHealthData, ConversationMessage } from '../types/conversation';
import { DbMemory } from '../types/memory';
import { ExternalServiceError } from '../errors/AppError';
import logger from '../utils/logger';

class AnthropicService {
  private client: Anthropic;
  private model: string = 'claude-sonnet-4-5-20250929';

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error('Missing ANTHROPIC_API_KEY in environment variables');
    }

    this.client = new Anthropic({ apiKey });
    logger.info('Anthropic client initialized');
  }

  async generateDailyBrief(userName: string, healthData: UserHealthData): Promise<string> {
    try {
      const systemPrompt = this.buildHealthCoachSystemPrompt();
      const userPrompt = this.buildDailyBriefPrompt(userName, healthData);

      logger.debug('Generating daily brief', { userName, dataTypes: Object.keys(healthData) });

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 800,
        temperature: 0.9,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const briefText = content.text;
      logger.info('Daily brief generated', { userName, length: briefText.length });

      return briefText;
    } catch (error: any) {
      logger.error('Failed to generate daily brief', {
        userName,
        error: error.message,
      });
      throw new ExternalServiceError('Anthropic', `Failed to generate brief: ${error.message}`);
    }
  }

  async generateResponse(
    conversationHistory: ConversationMessage[],
    userMessage: string,
    healthData?: UserHealthData,
    memories?: DbMemory[]
  ): Promise<string> {
    try {
      const systemPrompt = this.buildHealthCoachSystemPrompt(memories);

      const messages: Anthropic.MessageParam[] = conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      let finalUserMessage = userMessage;
      if (healthData && Object.keys(healthData).length > 0) {
        finalUserMessage = `${userMessage}\n\nRecent health data:\n${this.formatHealthDataForContext(healthData)}`;
      }

      messages.push({
        role: 'user',
        content: finalUserMessage,
      });

      logger.debug('Generating conversational response', {
        historyLength: conversationHistory.length,
        hasHealthData: !!healthData,
        memoriesCount: memories?.length || 0,
      });

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 600,
        temperature: 0.9,
        system: systemPrompt,
        messages,
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const responseText = content.text;
      logger.info('Conversational response generated', { length: responseText.length });

      return responseText;
    } catch (error: any) {
      logger.error('Failed to generate response', {
        error: error.message,
      });
      throw new ExternalServiceError('Anthropic', `Failed to generate response: ${error.message}`);
    }
  }

  private buildHealthCoachSystemPrompt(memories?: DbMemory[]): string {
    let prompt = `You're Puls - a 26-year-old personal trainer who's really good at reading health data and calling people out when they need it.

WHO YOU ARE:
- Confident, direct, slightly cocky but you genuinely care
- Been coaching for 5 years, seen every excuse in the book
- You don't do corporate wellness BS - you keep it REAL
- Not one of those cringe AI assistants that says "I'm here to help!" constantly
- You're basically that friend who pushes you to be better

HOW YOU TALK:
- Text like a normal person - short, punchy messages
- Break your thoughts into 2-3 quick texts (like rapid-fire messaging)
- Use "bro", "dude", "man" occasionally (gender-neutral, friendly)
- Drop the formal language - "you crushed it" not "excellent performance"
- Max 1-2 emojis per response, only when it fits naturally
- No corporate speak, no medical jargon, no BS

WHEN THEY'RE CRUSHING IT:
- Get genuinely hyped - "YO that's what I'm talking about!"
- Call out specific wins - "HRV climbed 6 points in 3 days"
- Push them to keep the momentum - "This is your window"

WHEN THEY'RE SLACKING:
- Call them out (but not mean) - "5 hours sleep? Bro."
- Ask what happened - "Late night scroll session?"
- Offer solutions, not lectures - "Let's fix this tonight"
- Tease when appropriate - "Those are rookie numbers"

WHAT YOU NEVER DO:
- Don't apologize excessively or be overly polite
- Don't say "perhaps", "if you don't mind", or formal phrases
- Don't write essays - keep it SHORT (under 150 words total)
- Don't act like other sycophantic chatbots
- Don't use markdown formatting - plain text only
- Don't flood with emojis

IMPORTANT:
- You're NOT a doctor, can't give medical advice
- If they mention symptoms or medical stuff, tell them to see a real doctor
- Focus on: sleep, activity, recovery, workouts, general wellness
- Lead with the most interesting data point, not boring summaries

MEMORY BANK:
When users share information you should remember, extract it and respond with a JSON object at the END of your message like this:
MEMORY_EXTRACT: {"type": "fact|preference|goal|reminder", "content": "what to remember", "scheduledFor": "2026-03-15T09:00:00Z"}

Examples:
- "I'm training for a marathon in June" → {"type": "goal", "content": "Training for marathon in June"}
- "I hate morning workouts" → {"type": "preference", "content": "Hates morning workouts"}
- "Remind me to buy new shoes next week" → {"type": "reminder", "content": "Buy new running shoes", "scheduledFor": "2026-03-11T09:00:00Z"}

When they ask "what do you remember?" or "forget about X", respond naturally but include:
- LIST_MEMORIES or FORGET_MEMORY: {"search": "X"}`;

    // Include existing memories in context
    if (memories && memories.length > 0) {
      prompt += '\n\nWHAT YOU REMEMBER ABOUT THIS USER:\n';
      for (const memory of memories) {
        const scheduledInfo = memory.scheduled_for ? ` (scheduled for ${memory.scheduled_for})` : '';
        prompt += `- [${memory.memory_type}] ${memory.content}${scheduledInfo}\n`;
      }
      prompt += '\nUse these memories to personalize your responses and reference them naturally when relevant.';
    }

    return prompt;
  }

  private buildDailyBriefPrompt(userName: string, healthData: UserHealthData): string {
    let prompt = `Yo, time for ${userName}'s morning check-in. Give them the real talk about their data.\n\n`;

    if (healthData.sleep && healthData.sleep.length > 0) {
      const latestSleep = healthData.sleep[0];
      const totalHours = Math.round(latestSleep.total / 60);
      const totalMins = latestSleep.total % 60;
      prompt += `Last night's sleep:\n`;
      prompt += `- ${totalHours}h ${totalMins}m total\n`;
      prompt += `- ${Math.round(latestSleep.deep / 60)}h ${latestSleep.deep % 60}m deep\n`;
      prompt += `- ${Math.round(latestSleep.rem / 60)}h ${latestSleep.rem % 60}m REM\n`;
      prompt += `- ${latestSleep.efficiency}% efficiency\n`;
      if (latestSleep.hrv_rmssd_avg) {
        prompt += `- HRV: ${latestSleep.hrv_rmssd_avg.toFixed(1)}ms\n`;
      }
      if ((latestSleep as any).resting_heart_rate) {
        prompt += `- Resting HR: ${Math.round((latestSleep as any).resting_heart_rate)} bpm\n`;
      }
      prompt += '\n';
    }

    if (healthData.activity && healthData.activity.length > 0) {
      const latestActivity = healthData.activity[0];
      const activeMins = latestActivity.high_activity_minutes + latestActivity.medium_activity_minutes;
      prompt += `Yesterday's activity:\n`;
      prompt += `- ${latestActivity.steps.toLocaleString()} steps\n`;
      prompt += `- ${latestActivity.calories_total} calories burned\n`;
      prompt += `- ${activeMins} active minutes\n\n`;
    }

    if (healthData.workouts && healthData.workouts.length > 0) {
      const latestWorkout = healthData.workouts[0];
      prompt += `Last workout:\n`;
      prompt += `- ${latestWorkout.title} (${latestWorkout.sport})\n`;
      prompt += `- ${Math.round(latestWorkout.duration / 60)} minutes\n`;
      if (latestWorkout.distance) {
        prompt += `- ${(latestWorkout.distance / 1000).toFixed(2)}km\n`;
      }
      if (latestWorkout.average_hr) {
        prompt += `- Avg HR: ${Math.round(latestWorkout.average_hr)} bpm\n`;
      }
      prompt += '\n';
    }

    if (!healthData.sleep && !healthData.activity && !healthData.workouts) {
      prompt += 'No data came through - device might not be synced.\n\n';
    }

    prompt += `Break your response into 2-3 short messages.

First message: Lead with the most interesting/surprising data point. Call them out OR hype them up based on what you see.

Second message: What should they do today? Be specific based on their recovery.

Third message (optional): One thing to focus on improving.

Keep it real, keep it short (under 150 words total). Text like you're messaging a friend.`;

    return prompt;
  }

  private formatHealthDataForContext(healthData: UserHealthData): string {
    let context = '';

    if (healthData.sleep && healthData.sleep.length > 0) {
      const sleep = healthData.sleep[0];
      context += `Sleep: ${Math.round(sleep.total / 60)}h ${sleep.total % 60}m, ${sleep.efficiency}% efficient`;
      if (sleep.hrv_rmssd_avg) {
        context += `, HRV ${sleep.hrv_rmssd_avg.toFixed(1)}ms`;
      }
      context += '\n';
    }

    if (healthData.activity && healthData.activity.length > 0) {
      const activity = healthData.activity[0];
      context += `Activity: ${activity.steps.toLocaleString()} steps, ${activity.calories_total} cal\n`;
    }

    if (healthData.workouts && healthData.workouts.length > 0) {
      const workout = healthData.workouts[0];
      context += `Recent workout: ${workout.title} (${workout.sport}), ${Math.round(workout.duration / 60)} min\n`;
    }

    return context.trim();
  }

  /**
   * Extract memory commands from Claude's response
   * Returns cleaned response text and any memory extractions
   */
  extractMemoryCommands(responseText: string): {
    cleanResponse: string;
    memoryExtract?: {
      type: 'fact' | 'preference' | 'goal' | 'reminder';
      content: string;
      scheduledFor?: string;
    };
    listMemories?: boolean;
    forgetMemory?: { search: string };
  } {
    const result: any = {
      cleanResponse: responseText,
    };

    // Extract MEMORY_EXTRACT
    const memoryMatch = responseText.match(/MEMORY_EXTRACT:\s*({[^}]+})/);
    if (memoryMatch) {
      try {
        const extracted = JSON.parse(memoryMatch[1]);
        result.memoryExtract = extracted;
        result.cleanResponse = responseText.replace(memoryMatch[0], '').trim();
        logger.debug('Memory extraction found', { extracted });
      } catch (error) {
        logger.warn('Failed to parse MEMORY_EXTRACT', { match: memoryMatch[1] });
      }
    }

    // Extract LIST_MEMORIES command
    if (responseText.includes('LIST_MEMORIES')) {
      result.listMemories = true;
      result.cleanResponse = result.cleanResponse.replace(/LIST_MEMORIES/g, '').trim();
    }

    // Extract FORGET_MEMORY command
    const forgetMatch = responseText.match(/FORGET_MEMORY:\s*({[^}]+})/);
    if (forgetMatch) {
      try {
        const extracted = JSON.parse(forgetMatch[1]);
        result.forgetMemory = extracted;
        result.cleanResponse = result.cleanResponse.replace(forgetMatch[0], '').trim();
        logger.debug('Forget memory command found', { extracted });
      } catch (error) {
        logger.warn('Failed to parse FORGET_MEMORY', { match: forgetMatch[1] });
      }
    }

    return result;
  }

  /**
   * Split response into multiple messages for rapid-fire texting effect
   * Creates 5-10 smaller messages for more natural conversation flow
   * Can be disabled via ENABLE_MESSAGE_SPLITTING=false to save on message quota
   * @param responseText - The full response from Claude
   * @param platform - Platform to optimize splitting for ('whatsapp' or 'telegram')
   * @returns Array of message strings
   */
  splitIntoMessages(responseText: string, platform: 'whatsapp' | 'telegram' = 'whatsapp'): string[] {
    // Check if message splitting is disabled (to save on Twilio quota)
    const enableSplitting = process.env.ENABLE_MESSAGE_SPLITTING !== 'false';

    if (!enableSplitting) {
      logger.debug('Message splitting disabled via env var');
      return [responseText];
    }

    // Platform-aware splitting
    if (platform === 'telegram') {
      return this.splitTelegramMessages(responseText);
    }

    return this.splitWhatsAppMessages(responseText);
  }

  /**
   * Split messages for Telegram (4096 char limit, less aggressive splitting)
   * @param text - Text to split
   * @returns Array of message strings
   */
  private splitTelegramMessages(text: string): string[] {
    const messages: string[] = [];
    const MAX_LENGTH = 4096;

    // Split by double newlines to get paragraphs
    const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);

    let currentMessage = '';

    for (const paragraph of paragraphs) {
      // If adding this paragraph would exceed limit, save current and start new
      if (currentMessage.length > 0 && (currentMessage.length + paragraph.length + 2) > MAX_LENGTH) {
        messages.push(currentMessage.trim());
        currentMessage = paragraph;
      } else {
        // Add paragraph to current message
        if (currentMessage.length > 0) {
          currentMessage += '\n\n' + paragraph;
        } else {
          currentMessage = paragraph;
        }
      }
    }

    // Add remaining message
    if (currentMessage.length > 0) {
      messages.push(currentMessage.trim());
    }

    logger.debug('Split response for Telegram', {
      originalLength: text.length,
      messageCount: messages.length
    });

    return messages.length > 0 ? messages : [text];
  }

  /**
   * Split messages for WhatsApp (aggressive splitting for rapid-fire effect)
   * @param responseText - Text to split
   * @returns Array of message strings
   */
  private splitWhatsAppMessages(responseText: string): string[] {
    const messages: string[] = [];

    // First, split by double newlines to get paragraphs
    const paragraphs = responseText.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);

    for (const paragraph of paragraphs) {
      // Check if this paragraph contains a bullet list
      const lines = paragraph.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const hasBullets = lines.some(l => l.startsWith('•') || l.startsWith('-') || l.startsWith('*'));

      if (hasBullets) {
        // Split bullet lists: group bullets together but separate from intro text
        const bulletLines: string[] = [];
        const nonBulletLines: string[] = [];

        for (const line of lines) {
          if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
            bulletLines.push(line);
          } else {
            nonBulletLines.push(line);
          }
        }

        // Add intro text as separate message if it exists
        if (nonBulletLines.length > 0) {
          messages.push(nonBulletLines.join('\n'));
        }

        // Add bullet list as separate message
        if (bulletLines.length > 0) {
          messages.push(bulletLines.join('\n'));
        }
      } else {
        // For non-bullet paragraphs, split at sentence boundaries if long
        if (paragraph.length > 100) {
          const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];

          // Send each 1-2 sentences as a separate message for rapid-fire feel
          let currentMessage = '';
          for (const sentence of sentences) {
            if (currentMessage.length === 0) {
              currentMessage = sentence.trim();
            } else if (currentMessage.length + sentence.length < 150) {
              // Group max 2 sentences together
              currentMessage += ' ' + sentence.trim();
            } else {
              // Send current message and start new one
              messages.push(currentMessage);
              currentMessage = sentence.trim();
            }
          }

          if (currentMessage.length > 0) {
            messages.push(currentMessage);
          }
        } else {
          // Short paragraph - send as is
          messages.push(paragraph);
        }
      }
    }

    logger.debug('Split response for WhatsApp', {
      originalLength: responseText.length,
      messageCount: messages.length
    });

    return messages.length > 0 ? messages : [responseText];
  }
}

export default new AnthropicService();
