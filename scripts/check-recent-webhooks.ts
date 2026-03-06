import '../src/config';
import supabaseService from '../src/services/supabase';

async function checkRecentWebhooks() {
  const { data: ben } = await (supabaseService as any).client
    .from('users')
    .select('id, junction_user_id')
    .eq('name', 'Ben')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log('\n👤 Ben Junction ID:', ben.junction_user_id);

  // Check all data received in last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: recentData } = await (supabaseService as any).client
    .from('wearable_data')
    .select('event_type, received_at, junction_user_id, provider')
    .eq('user_id', ben.id)
    .gte('received_at', oneHourAgo)
    .order('received_at', { ascending: false });

  console.log(`\n📊 Data received in last hour: ${recentData?.length || 0}`);

  if (recentData && recentData.length > 0) {
    const types = new Set(recentData.map((d: any) => d.event_type));
    console.log('\nEvent types:');
    types.forEach(t => console.log(`   - ${t}`));
  }

  // Check what event types we've EVER received for any user from Strava
  const { data: stravaEvents } = await (supabaseService as any).client
    .from('wearable_data')
    .select('event_type, provider')
    .or('provider.eq.strava,provider.is.null')
    .limit(1000);

  const stravaTypes = new Set(stravaEvents?.map((d: any) => d.event_type) || []);

  console.log(`\n🎯 All event types we've ever received (Strava-related, ${stravaEvents?.length} events):`);
  Array.from(stravaTypes).sort().forEach(t => console.log(`   - ${t}`));

  // Check if there are workout-like events with different names
  const workoutLike = Array.from(stravaTypes).filter(t =>
    t.toLowerCase().includes('workout') ||
    t.toLowerCase().includes('activity') ||
    t.toLowerCase().includes('exercise')
  );

  if (workoutLike.length > 0) {
    console.log('\n💪 Workout-related events:');
    workoutLike.forEach(t => console.log(`   - ${t}`));
  } else {
    console.log('\n❌ NO workout-related events found in database!');
    console.log('   This means Junction is not sending workout webhooks to our app.');
  }

  process.exit(0);
}

checkRecentWebhooks();
