import '../src/config';
import supabaseService from '../src/services/supabase';

async function checkBenData() {
  // Get Ben
  const { data: ben } = await (supabaseService as any).client
    .from('users')
    .select('*')
    .eq('name', 'Ben')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log('\n👤 Ben:');
  console.log('   Created:', ben.created_at);
  console.log('   Junction ID:', ben.junction_user_id);
  console.log('   Onboarding complete:', ben.onboarding_complete);

  // Check ALL wearable data (not just summary)
  const { data: allData } = await (supabaseService as any).client
    .from('wearable_data')
    .select('event_type, received_at, provider')
    .eq('user_id', ben.id)
    .order('received_at', { ascending: false });

  console.log('\n📊 All wearable data:');
  console.log('   Total data points:', allData?.length || 0);

  if (allData && allData.length > 0) {
    // Group by event type
    const byType: Record<string, any[]> = {};
    allData.forEach((item: any) => {
      if (!byType[item.event_type]) {
        byType[item.event_type] = [];
      }
      byType[item.event_type].push(item);
    });

    console.log('\n   Breakdown:');
    Object.entries(byType).forEach(([type, items]) => {
      console.log(`      ${type}: ${items.length}`);
      console.log(`         Provider: ${items[0].provider}`);
      console.log(`         Latest: ${items[0].received_at}`);
    });
  } else {
    console.log('   ❌ No data at all!');
    console.log('\n   Possible reasons:');
    console.log('   - Strava hasn\'t synced yet (can take a few minutes)');
    console.log('   - Junction historical pull still processing');
    console.log('   - Webhooks not firing');
    console.log('   - User has no recent Strava activities');
  }

  // Check conversation state
  const { data: state } = await (supabaseService as any).client
    .from('conversation_state')
    .select('*')
    .eq('user_id', ben.id)
    .single();

  console.log('\n💬 Conversation state:');
  console.log('   State:', state?.state);
  console.log('   History length:', state?.context?.conversationHistory?.length || 0);

  if (state?.context?.conversationHistory) {
    console.log('\n   Last messages:');
    state.context.conversationHistory.slice(-3).forEach((msg: any) => {
      console.log(`      ${msg.role}: ${msg.content.substring(0, 80)}...`);
    });
  }

  process.exit(0);
}

checkBenData();
