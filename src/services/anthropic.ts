import '../config';
import Anthropic from '@anthropic-ai/sdk';
import { UserHealthData, ConversationMessage } from '../types/conversation';
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
        max_tokens: 2000,
        temperature: 0.7,
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
    healthData?: UserHealthData
  ): Promise<string> {
    try {
      const systemPrompt = this.buildHealthCoachSystemPrompt();

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
      });

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        temperature: 0.8,
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

  private buildHealthCoachSystemPrompt(): string {
    return `You are Puls, a warm and encouraging AI health coach. Your role is to help users understand their wearable data and make sustainable improvements to their health and fitness.

Personality:
- Warm, supportive, and encouraging
- Data-driven but human-focused
- Frame challenges as opportunities for growth
- Celebrate progress, no matter how small

Communication style:
- Keep responses concise (under 200 words)
- Use plain text only, no markdown formatting
- Speak conversationally, like a knowledgeable friend
- Reference specific numbers from their data when relevant

Important guidelines:
- You are NOT a doctor and cannot provide medical advice
- If someone mentions symptoms or medical concerns, encourage them to consult a healthcare professional
- Focus on general wellness, sleep, activity, and recovery
- Don't make definitive health diagnoses or prescribe treatments

Your expertise:
- Sleep quality and recovery
- Activity patterns and exercise
- Heart rate variability (HRV) and stress
- General wellness trends and patterns`;
  }

  private buildDailyBriefPrompt(userName: string, healthData: UserHealthData): string {
    let prompt = `Generate a personalized morning health brief for ${userName}.\n\n`;

    if (healthData.sleep && healthData.sleep.length > 0) {
      const latestSleep = healthData.sleep[0];
      prompt += `Sleep (${latestSleep.date}):\n`;
      prompt += `- Total: ${Math.round(latestSleep.total / 60)} hours ${latestSleep.total % 60} minutes\n`;
      prompt += `- Deep: ${Math.round(latestSleep.deep / 60)} hours ${latestSleep.deep % 60} minutes\n`;
      prompt += `- REM: ${Math.round(latestSleep.rem / 60)} hours ${latestSleep.rem % 60} minutes\n`;
      prompt += `- Efficiency: ${latestSleep.efficiency}%\n`;
      if (latestSleep.hrv_rmssd_avg) {
        prompt += `- HRV: ${latestSleep.hrv_rmssd_avg.toFixed(1)} ms\n`;
      }
      prompt += '\n';
    }

    if (healthData.activity && healthData.activity.length > 0) {
      const latestActivity = healthData.activity[0];
      prompt += `Activity (${latestActivity.date}):\n`;
      prompt += `- Steps: ${latestActivity.steps.toLocaleString()}\n`;
      prompt += `- Calories: ${latestActivity.calories_total}\n`;
      prompt += `- Active minutes: ${latestActivity.high_activity_minutes + latestActivity.medium_activity_minutes}\n`;
      prompt += '\n';
    }

    if (healthData.workouts && healthData.workouts.length > 0) {
      const latestWorkout = healthData.workouts[0];
      prompt += `Recent workout (${latestWorkout.date}):\n`;
      prompt += `- ${latestWorkout.title} (${latestWorkout.sport})\n`;
      prompt += `- Duration: ${Math.round(latestWorkout.duration / 60)} minutes\n`;
      if (latestWorkout.distance) {
        prompt += `- Distance: ${(latestWorkout.distance / 1000).toFixed(2)} km\n`;
      }
      prompt += '\n';
    }

    if (!healthData.sleep && !healthData.activity && !healthData.workouts) {
      prompt += 'No recent data available. Device may not have synced.\n\n';
    }

    prompt += `Please provide:
1. A brief assessment of their recovery status
2. One specific training or activity recommendation for today
3. One focus area to improve their health

Keep it encouraging and actionable. Under 200 words total.`;

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
}

export default new AnthropicService();
