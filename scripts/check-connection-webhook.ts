import '../src/config';
import supabaseService from '../src/services/supabase';

async function checkConnectionWebhook() {
  // Get Ben
  const { data: ben } = await (supabaseService as any).client
    .from('users')
    .select('*')
    .eq('telegram_user_id', '7988727447')
    .single();

  console.log('\n👤 Ben Status:');
  console.log('   Junction ID:', ben.junction_user_id || 'NOT CONNECTED');
  console.log('   State:', ben.onboarding_complete ? 'Complete' : 'Incomplete');

  // Check conversation state
  const { data: state } = await (supabaseService as any).client
    .from('conversation_state')
    .select('*')
    .eq('user_id', ben.id)
    .single();

  console.log('   Conversation state:', state?.state);
  console.log('   Onboarding phase:', state?.context?.onboardingPhase || 'None');

  if (state?.context?.conversationHistory) {
    const lastMessages = state.context.conversationHistory.slice(-3);
    console.log('\n💬 Last messages:');
    lastMessages.forEach((msg: any) => {
      console.log(`   ${msg.role}: ${msg.content.substring(0, 80)}...`);
    });
  }

  // Check if any wearable data arrived
  const { data: recentData } = await (supabaseService as any).client
    .from('wearable_data')
    .select('event_type, received_at')
    .eq('user_id', ben.id)
    .order('received_at', { ascending: false })
    .limit(5);

  console.log(`\n📊 Recent data: ${recentData?.length || 0} events`);
  if (recentData && recentData.length > 0) {
    recentData.forEach((d: any) => {
      console.log(`   - ${d.event_type} (${d.received_at})`);
    });
  }

  if (!ben.junction_user_id) {
    console.log('\n⚠️  Ben hasn\'t completed the connection yet!');
    console.log('   He needs to:');
    console.log('   1. Click the Vital Link');
    console.log('   2. Connect Strava');
    console.log('   3. Say "done"');
  }

  process.exit(0);
}

checkConnectionWebhook();
