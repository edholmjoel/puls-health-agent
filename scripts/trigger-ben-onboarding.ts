import '../src/config';
import supabaseService from '../src/services/supabase';
import { dataAnalyzerService } from '../src/services/data-analyzer';
import anthropicService from '../src/services/anthropic';
import telegramService from '../src/services/telegram';
import { DateTime } from 'luxon';

async function triggerBenOnboarding() {
  const benTelegramId = '7988727447';

  // Get Ben
  const { data: ben } = await (supabaseService as any).client
    .from('users')
    .select('*')
    .eq('telegram_user_id', benTelegramId)
    .single();

  console.log('\n👤 Ben:', ben.name);
  console.log('   User ID:', ben.id);
  console.log('   Junction ID:', ben.junction_user_id);

  // Fetch his wearable data
  console.log('\n📊 Fetching wearable data...');
  const { data: wearableData } = await (supabaseService as any).client
    .from('wearable_data')
    .select('*')
    .eq('user_id', ben.id)
    .or('event_type.ilike.%sleep.created,event_type.ilike.%activity.created,event_type.ilike.%workout%.created');

  console.log(`   ✅ Found ${wearableData?.length || 0} data points`);

  if (!wearableData || wearableData.length === 0) {
    console.log('\n❌ No wearable data found!');
    process.exit(1);
  }

  // Break down by type
  const types: Record<string, number> = {};
  wearableData.forEach((d: any) => {
    types[d.event_type] = (types[d.event_type] || 0) + 1;
  });
  console.log('\nData breakdown:');
  Object.entries(types).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });

  // Analyze the data
  console.log('\n🔍 Analyzing data...');
  const insights = await dataAnalyzerService.generateOnboardingInsights(wearableData);

  console.log('\n✨ Generated insights:');
  console.log('   Fitness level:', insights.fitnessLevel);
  console.log('   Workout style:', insights.workoutStyle);
  console.log('   Sleep pattern:', insights.sleepPattern);
  console.log('   Achievements:', insights.achievements.length);
  insights.achievements.forEach((a, i) => {
    console.log(`      ${i + 1}. ${a}`);
  });

  // Generate opening messages
  console.log('\n💬 Generating opening messages...');
  const openingMessages = await anthropicService.generateOnboardingOpening(
    ben.name,
    insights
  );

  console.log(`\n📱 Generated ${openingMessages.length} messages:`);
  openingMessages.forEach((msg, i) => {
    console.log(`   ${i + 1}. ${msg}`);
  });

  // Send messages to Ben on Telegram
  console.log('\n📤 Sending messages to Ben...');
  for (let i = 0; i < openingMessages.length; i++) {
    await telegramService.sendMessage(benTelegramId, openingMessages[i]);
    console.log(`   ✅ Sent message ${i + 1}`);

    // Add realistic delay between messages
    if (i < openingMessages.length - 1) {
      const delay = 300 + Math.random() * 200;
      console.log(`   ⏱️  Waiting ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Update conversation state
  console.log('\n💾 Updating conversation state...');
  const { data: conversationState } = await (supabaseService as any).client
    .from('conversation_state')
    .select('*')
    .eq('user_id', ben.id)
    .single();

  const currentContext = (conversationState?.context as any) || {};

  await (supabaseService as any).client
    .from('conversation_state')
    .update({
      context: {
        ...currentContext,
        onboardingInsights: insights,
        onboardingPhase: 'question_1',
      },
    })
    .eq('user_id', ben.id);

  console.log('   ✅ Updated to onboarding phase: question_1');

  console.log('\n🎉 Onboarding triggered successfully!');
  console.log('   Ben should now receive the personalized messages on Telegram');
  console.log('   His next response will progress to question_2');

  process.exit(0);
}

triggerBenOnboarding();
