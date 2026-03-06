import '../src/config';
import supabaseService from '../src/services/supabase';
import twilioService from '../src/services/twilio';
import telegramService from '../src/services/telegram';
import { dataAnalyzerService } from '../src/services/data-analyzer';
import anthropicService from '../src/services/anthropic';

/**
 * Test the onboarding flow by simulating a connection created event
 */
async function testOnboarding() {
  try {
    // Your user ID
    const userId = '9ad88fdc-1b4f-4c85-98c3-ff4757e16a4f';

    console.log('\n🎬 Testing Onboarding Flow for Joel\n');

    // Get user directly from database
    const { data: user, error: userError } = await (supabaseService as any).client
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('❌ User not found:', userError);
      process.exit(1);
    }

    console.log('✅ User found:', user.name);
    console.log('   Platform:', user.platform);
    console.log('   Junction ID:', user.junction_user_id);

    // Fetch summary data (same as webhook handler does)
    console.log('\n📊 Fetching wearable data...');
    const { data: wearableData, error } = await (supabaseService as any).client
      .from('wearable_data')
      .select('*')
      .eq('user_id', user.id)
      .or('event_type.ilike.%sleep.created,event_type.ilike.%activity.created,event_type.ilike.%workout.created')
      .order('received_at', { ascending: false });

    if (error) throw error;

    console.log(`✅ Found ${wearableData?.length || 0} data points`);

    if (!wearableData || wearableData.length === 0) {
      console.log('\n❌ No data available for onboarding insights');
      process.exit(1);
    }

    // Analyze data
    console.log('\n🧠 Analyzing data...');
    const insights = await dataAnalyzerService.generateOnboardingInsights(wearableData);

    console.log('\n📈 Insights Generated:');
    console.log('   Fitness Level:', insights.fitnessLevel);
    console.log('   Workout Style:', insights.workoutStyle);
    console.log('   Sleep Pattern:', insights.sleepPattern);
    console.log('   Achievements:', insights.achievements.length);
    insights.achievements.forEach((a, i) => {
      console.log(`      ${i + 1}. ${a}`);
    });

    if (!insights || insights.achievements.length === 0) {
      console.log('\n❌ No meaningful insights generated');
      process.exit(1);
    }

    // Generate opening messages
    console.log('\n✍️  Generating opening messages...');
    const openingMessages = await anthropicService.generateOnboardingOpening(
      user.name || 'there',
      insights
    );

    console.log(`✅ Generated ${openingMessages.length} messages\n`);

    // Display messages with timing
    console.log('📱 Messages that will be sent:\n');
    console.log('─────────────────────────────────────');
    for (let i = 0; i < openingMessages.length; i++) {
      console.log(`\n💬 Message ${i + 1}:`);
      console.log(`   "${openingMessages[i]}"`);
      if (i < openingMessages.length - 1) {
        console.log(`   [${300 + Math.round(Math.random() * 200)}ms delay]`);
      }
    }
    console.log('\n─────────────────────────────────────');

    // Ask if user wants to actually send
    console.log('\n❓ Do you want to send these messages?');
    console.log('   This will send to your', user.platform, 'account');
    console.log('\n   Press Ctrl+C to cancel, or wait 5 seconds to send...\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Send messages
    console.log('📤 Sending messages...\n');

    const sendMessage = async (message: string) => {
      if (user.platform === 'telegram' && user.telegram_user_id) {
        await telegramService.sendMessage(user.telegram_user_id, message);
      } else if (user.platform === 'whatsapp' && user.phone_number) {
        await twilioService.sendMessage(user.phone_number, message);
      }
    };

    for (let i = 0; i < openingMessages.length; i++) {
      console.log(`   ✅ Sent message ${i + 1}/${openingMessages.length}`);
      await sendMessage(openingMessages[i]);

      if (i < openingMessages.length - 1) {
        const delay = 300 + Math.random() * 200;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Update conversation state
    console.log('\n💾 Updating conversation state...');
    const conversationState = await supabaseService.getConversationState(user.id);
    const currentContext = (conversationState?.context as any) || {};
    await supabaseService.updateConversationState(user.id, {
      state: 'active',
      context: {
        ...currentContext,
        onboardingInsights: insights,
        onboardingPhase: 'question_1',
      } as any,
    });

    console.log('✅ Conversation state updated');
    console.log('\n🎉 Onboarding flow tested successfully!');
    console.log('   Check your', user.platform, 'to see the messages\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

testOnboarding();
