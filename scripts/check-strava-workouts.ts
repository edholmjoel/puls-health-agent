import '../src/config';
import supabaseService from '../src/services/supabase';

async function checkStravaWorkouts() {
  // Check for workout events where provider is explicitly strava
  const { data: stravaWorkouts } = await (supabaseService as any).client
    .from('wearable_data')
    .select('event_type, provider, received_at, payload')
    .eq('provider', 'strava')
    .ilike('event_type', '%workout%');

  console.log(`\n🏃 Strava workout events (provider='strava'): ${stravaWorkouts?.length || 0}`);

  if (stravaWorkouts && stravaWorkouts.length > 0) {
    console.log('\nSample:');
    console.log(JSON.stringify(stravaWorkouts[0], null, 2));
  }

  // Check for ANY workout events (regardless of provider)
  const { data: allWorkouts } = await (supabaseService as any).client
    .from('wearable_data')
    .select('provider, count')
    .ilike('event_type', '%workout%');

  console.log('\n📊 All workout events by provider:');
  const byProvider: Record<string, number> = {};

  const { data: workoutEvents } = await (supabaseService as any).client
    .from('wearable_data')
    .select('provider')
    .ilike('event_type', '%workout%');

  workoutEvents?.forEach((e: any) => {
    const provider = e.provider || 'null';
    byProvider[provider] = (byProvider[provider] || 0) + 1;
  });

  Object.entries(byProvider).forEach(([provider, count]) => {
    console.log(`   ${provider}: ${count}`);
  });

  console.log('\n💡 Conclusion:');
  if (!stravaWorkouts || stravaWorkouts.length === 0) {
    console.log('   ❌ We have NEVER received a Strava workout webhook!');
    console.log('   This is a Junction/Vital configuration issue.');
    console.log('   Strava workouts are in Junction but not being webhooks to us.');
  }

  process.exit(0);
}

checkStravaWorkouts();
