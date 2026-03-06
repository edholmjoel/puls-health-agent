import '../src/config';
import supabaseService from '../src/services/supabase';

async function checkNewUser() {
  // Get the most recent user
  const { data: users } = await (supabaseService as any).client
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\n📊 Most recent users:\n');

  for (const user of users || []) {
    console.log(`${user.name} (${user.platform})`);
    console.log(`   Created: ${user.created_at}`);
    console.log(`   Onboarding complete: ${user.onboarding_complete}`);
    console.log(`   Junction ID: ${user.junction_user_id || 'Not connected'}`);

    // Get conversation state
    const { data: state } = await (supabaseService as any).client
      .from('conversation_state')
      .select('*')
      .eq('user_id', user.id)
      .single();

    console.log(`   Conversation state: ${state?.state || 'None'}`);
    console.log(`   Onboarding phase: ${state?.context?.onboardingPhase || 'None'}`);

    // Check wearable data
    const { data: wearableData } = await (supabaseService as any).client
      .from('wearable_data')
      .select('event_type')
      .eq('user_id', user.id)
      .or('event_type.ilike.%sleep.created,event_type.ilike.%activity.created,event_type.ilike.%workout.created');

    console.log(`   Summary data points: ${wearableData?.length || 0}`);
    console.log('');
  }

  process.exit(0);
}

checkNewUser();
