import '../config';
import Anthropic from '@anthropic-ai/sdk';
import supabaseService from '../services/supabase';
import logger from '../utils/logger';

/**
 * Analyze all available historical data for a user and generate a persistent health profile.
 * Called ~30 minutes after device connection to allow historical webhooks to arrive first.
 */
export async function generateHealthProfile(userId: string): Promise<void> {
  try {
    logger.info('Generating health profile', { userId });

    // Fetch up to 2 years of summary data (timeseries excluded by USEFUL_EVENT_TYPES filter)
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const wearableData = await supabaseService.getWearableDataForUser(
      userId,
      twoYearsAgo.toISOString()
    );

    if (wearableData.length === 0) {
      logger.info('No data available for health profile generation', { userId });
      return;
    }

    const workouts = wearableData.filter((d) => d.event_type.includes('workout'));
    const sleep = wearableData.filter((d) => d.event_type.includes('sleep'));
    const activity = wearableData.filter((d) => d.event_type.includes('activity'));

    logger.info('Data collected for health profile', {
      userId,
      workouts: workouts.length,
      sleep: sleep.length,
      activity: activity.length,
    });

    // Find date range from data
    const allDates = wearableData
      .map((d) => (d.payload as any)?.calendar_date || (d.payload as any)?.date)
      .filter(Boolean)
      .sort();
    const dataRangeStart = allDates[0] || undefined;
    const dataRangeEnd = allDates[allDates.length - 1] || undefined;

    const prompt = `Analyze this user's health and fitness data and return a JSON health profile.

Data summary:
- Workouts: ${workouts.length} sessions
- Sleep records: ${sleep.length} nights
- Activity records: ${activity.length} days
- Date range: ${dataRangeStart || 'unknown'} to ${dataRangeEnd || 'unknown'}

Recent workout data (up to 60 most recent):
${JSON.stringify(workouts.slice(0, 60).map((w) => w.payload), null, 2)}

Recent sleep data (up to 30 nights):
${JSON.stringify(sleep.slice(0, 30).map((s) => s.payload), null, 2)}

Recent activity data (up to 30 days):
${JSON.stringify(activity.slice(0, 30).map((a) => a.payload), null, 2)}

Generate a JSON health profile with EXACTLY this structure (use null for unknown values):
{
  "fitness_level": "beginner|intermediate|advanced",
  "primary_sport": "sport name as string",
  "achievements": {
    "longest_run_km": number or null,
    "longest_run_date": "YYYY-MM-DD" or null,
    "fastest_5k_mins": number or null,
    "biggest_ride_km": number or null,
    "best_sleep_score": number or null
  },
  "baselines": {
    "avg_weekly_workouts": number,
    "avg_sleep_hours": number or null,
    "resting_hr": number or null,
    "hrv_avg": number or null,
    "avg_weekly_km": number or null
  },
  "patterns": {
    "preferred_days": ["day1", "day2"],
    "consistency": "consistent|irregular|sporadic",
    "active_months": ["month1", "month2"]
  },
  "summary": "2-3 sentence description of this user's fitness profile and training style"
}

Respond with ONLY the JSON object, no markdown, no explanation.`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Missing ANTHROPIC_API_KEY');
    }

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const profileText =
      response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    let profile: any;
    try {
      profile = JSON.parse(profileText);
    } catch (parseError) {
      // Try to extract JSON from the response in case there's surrounding text
      const jsonMatch = profileText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        profile = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error(`Failed to parse health profile JSON: ${profileText.substring(0, 200)}`);
      }
    }

    await supabaseService.storeHealthProfile(userId, profile, {
      totalWorkoutsAnalyzed: workouts.length,
      dataRangeStart,
      dataRangeEnd,
    });

    logger.info('Health profile generated and stored', {
      userId,
      fitnessLevel: profile.fitness_level,
      primarySport: profile.primary_sport,
      workoutsAnalyzed: workouts.length,
    });
  } catch (error: any) {
    logger.error('Failed to generate health profile', {
      userId,
      error: error.message,
    });
    // Non-fatal — profile generation failure doesn't break onboarding
  }
}
