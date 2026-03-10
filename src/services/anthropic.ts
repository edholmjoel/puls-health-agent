import '../config';
import Anthropic from '@anthropic-ai/sdk';
import { UserHealthData, ConversationMessage, StateContext } from '../types/conversation';
import { DbMemory } from '../types/memory';
import { OnboardingInsights } from '../types/onboarding';
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
    memories?: DbMemory[],
    context?: StateContext,
    healthProfile?: any
  ): Promise<string> {
    try {
      const systemPrompt = this.buildHealthCoachSystemPrompt(memories, healthProfile);

      const messages: Anthropic.MessageParam[] = conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Check if we're in onboarding mode
      const isOnboarding = context?.onboardingPhase &&
        context.onboardingPhase !== 'complete' &&
        conversationHistory.length < 8; // First ~4 exchanges

      let finalUserMessage = userMessage;

      // Add onboarding context if applicable
      if (isOnboarding && context?.onboardingInsights) {
        const additionalContext = `
ONBOARDING MODE:
You just welcomed this user and asked about their training goals.
You have additional insights about them that you haven't shared yet:

${context.onboardingInsights.achievements.slice(1).map(a => `- ${a}`).join('\n')}

Gradually reveal these insights as the conversation progresses.
- React to their answer first
- Then share ONE more insight
- Ask a follow-up question
- Build on what they tell you

Don't dump all data at once. Keep it conversational and natural.
`;
        finalUserMessage = `${additionalContext}\n\n${userMessage}`;
      } else if (healthData) {
        const healthContext = this.formatHealthDataForContext(healthData);
        if (healthContext) {
          finalUserMessage = `${userMessage}\n\nRecent health data:\n${healthContext}`;
        }
      }

      messages.push({
        role: 'user',
        content: finalUserMessage,
      });

      logger.debug('Generating conversational response', {
        historyLength: conversationHistory.length,
        hasHealthData: !!healthData,
        memoriesCount: memories?.length || 0,
        isOnboarding,
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

  /**
   * Generate onboarding opening - ONLY 2 messages (1 insight + 1 question)
   * This creates the initial hook after wearable connection
   */
  async generateOnboardingOpening(
    userName: string,
    insights: OnboardingInsights
  ): Promise<string[]> {
    try {
      const systemPrompt = this.buildHealthCoachSystemPrompt();

      // Pick the single most impressive achievement to lead with
      const topAchievement = insights.achievements[0] || 'Looking at your recent data';

      const userPrompt = `You're welcoming ${userName} who just connected their wearable device.

Their most impressive achievement from the last 60 days:
${topAchievement}

Overall profile:
- Fitness level: ${insights.fitnessLevel}
- Style: ${insights.workoutStyle}
- Sleep pattern: ${insights.sleepPattern}

Generate 3-5 short messages to start the conversation (rapid-fire texting style):

Message 1: Hook them with ONE specific data point that will WOW them (be excited, show you analyzed their data)
Message 2: Quick follow-up or reaction to that data point
Message 3: Ask ONE open-ended question about their goals or training
Message 4-5 (optional): If natural, add brief observations

CRITICAL:
- Do NOT share all insights at once
- Keep each message SHORT (10-25 words max)
- Text like rapid-fire messaging (short bursts)
- Save other insights for follow-up after they respond
- Be conversational and natural
- ONLY reference the achievement provided above - do NOT mention sleep, HRV, or other metrics if they say "no data"
- If sleep pattern is "no data", DO NOT mention sleep at all

Be genuinely impressed. Be casual. Text like you're excited to talk.`;

      logger.debug('Generating onboarding opening', { userName, topAchievement });

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 300,
        temperature: 0.9,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const response = content.text;

      // Split into individual messages (3-5 for rapid-fire feel)
      const lines = response.split('\n').filter(line => line.trim().length > 0);
      const messages = lines.slice(0, 5); // Allow up to 5 messages

      logger.info('Onboarding opening generated', {
        userName,
        messageCount: messages.length,
      });

      return messages;
    } catch (error: any) {
      logger.error('Failed to generate onboarding opening', {
        userName,
        error: error.message,
      });
      throw new ExternalServiceError('Anthropic', `Failed to generate onboarding opening: ${error.message}`);
    }
  }

  private buildHealthCoachSystemPrompt(memories?: DbMemory[], healthProfile?: any): string {
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

CRITICAL - NEVER HALLUCINATE DATA:
- ONLY reference metrics that are explicitly provided in the health data
- If you don't have sleep data, DON'T mention sleep, HRV, or resting HR
- If you don't have workout data, DON'T mention workouts or training
- If you don't have activity data, DON'T mention steps or calories
- NEVER make up numbers, percentages, or trends
- If asked about data you don't have, be honest: "I don't have that data yet"
- Better to say nothing than to assume or guess

MEMORY BANK:
When users share information you should remember, extract it and respond with a JSON object at the END of your message like this:
MEMORY_EXTRACT: {"type": "fact|preference|goal|reminder", "content": "what to remember", "scheduledFor": "2026-03-15T09:00:00Z"}

Examples:
- "I'm training for a marathon in June" → {"type": "goal", "content": "Training for marathon in June"}
- "I hate morning workouts" → {"type": "preference", "content": "Hates morning workouts"}
- "Remind me to buy new shoes next week" → {"type": "reminder", "content": "Buy new running shoes", "scheduledFor": "2026-03-11T09:00:00Z"}

When they ask "what do you remember?" or "forget about X", respond naturally but include:
- LIST_MEMORIES or FORGET_MEMORY: {"search": "X"}`;

    // Include health profile if available
    if (healthProfile?.profile) {
      const p = healthProfile.profile;
      prompt += '\n\nUSER HEALTH PROFILE (built from their full history):';
      if (p.fitness_level) prompt += `\n- Fitness level: ${p.fitness_level}`;
      if (p.primary_sport) prompt += `\n- Primary sport: ${p.primary_sport}`;
      if (p.baselines) {
        const b = p.baselines;
        if (b.avg_weekly_workouts) prompt += `\n- Avg workouts/week: ${b.avg_weekly_workouts}`;
        if (b.avg_sleep_hours) prompt += `\n- Avg sleep: ${b.avg_sleep_hours}h`;
        if (b.resting_hr) prompt += `\n- Resting HR: ${b.resting_hr} bpm`;
        if (b.hrv_avg) prompt += `\n- Avg HRV: ${b.hrv_avg}ms`;
        if (b.avg_weekly_km) prompt += `\n- Avg weekly km: ${b.avg_weekly_km}`;
      }
      if (p.achievements) {
        const a = p.achievements;
        if (a.longest_run_km) prompt += `\n- Longest run: ${a.longest_run_km}km`;
        if (a.fastest_5k_mins) prompt += `\n- Fastest 5K: ${a.fastest_5k_mins} mins`;
        if (a.biggest_ride_km) prompt += `\n- Biggest ride: ${a.biggest_ride_km}km`;
      }
      if (p.patterns?.consistency) prompt += `\n- Consistency: ${p.patterns.consistency}`;
      if (p.summary) prompt += `\n- Summary: ${p.summary}`;
      prompt += '\n\nUse this profile to personalize responses — reference their history naturally when relevant.';
    }

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
      const rawSport: any = latestWorkout.sport;
      const sport = typeof rawSport === 'string' ? rawSport : (rawSport?.name || rawSport?.slug || 'workout');
      const duration = latestWorkout.duration || (latestWorkout as any).moving_time || 0;
      prompt += `Last workout:\n`;
      prompt += `- ${latestWorkout.title} (${sport})\n`;
      prompt += `- ${Math.round(duration / 60)} minutes\n`;
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
      const rawWorkoutSport: any = workout.sport;
      const sport = typeof rawWorkoutSport === 'string' ? rawWorkoutSport : (rawWorkoutSport?.name || rawWorkoutSport?.slug || 'workout');
      const duration = workout.duration || (workout as any).moving_time || 0;
      context += `Recent workout: ${workout.title} (${sport}), ${Math.round(duration / 60)} min\n`;
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
