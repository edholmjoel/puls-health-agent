import '../src/config';
import supabaseService from '../src/services/supabase';

async function checkBenWorkouts() {
  const { data: ben } = await (supabaseService as any).client
    .from('users')
    .select('id')
    .eq('name', 'Ben')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const { data } = await (supabaseService as any).client
    .from('wearable_data')
    .select('event_type, received_at, payload')
    .eq('user_id', ben.id);

  const types: Record<string, number> = {};
  data.forEach((d: any) => {
    types[d.event_type] = (types[d.event_type] || 0) + 1;
  });

  console.log('\n📊 All event types for Ben:');
  Object.entries(types).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });

  const workouts = data.filter((d: any) => d.event_type.includes('workout'));
  console.log(`\n🏃 Workout events: ${workouts.length}`);

  if (workouts.length > 0) {
    console.log('   Latest workout:', workouts[0].received_at);
    console.log('   Sample:', JSON.stringify(workouts[0].payload, null, 2).substring(0, 200));
  } else {
    console.log('\n❌ No workout summary events!');
    console.log('   This means:');
    console.log('   - Ben has no recent Strava activities, OR');
    console.log('   - Strava workout webhooks not firing yet, OR');
    console.log('   - Only heartrate streams are syncing');
  }

  process.exit(0);
}

checkBenWorkouts();
