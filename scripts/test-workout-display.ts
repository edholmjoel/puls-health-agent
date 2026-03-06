import '../src/config';
import supabaseService from '../src/services/supabase';
import anthropicService from '../src/services/anthropic';

async function testWorkoutDisplay() {
  const benTelegramId = '7988727447';

  // Get Ben
  const { data: ben } = await (supabaseService as any).client
    .from('users')
    .select('*')
    .eq('telegram_user_id', benTelegramId)
    .single();

  console.log('\n👤 Testing workout display for Ben');

  // Fetch wearable data (same way conversation handler does it)
  const { data: wearableData } = await (supabaseService as any).client
    .from('wearable_data')
    .select('*')
    .eq('user_id', ben.id)
    .order('received_at', { ascending: false });

  // Build healthData (same way conversation handler does it)
  const healthData = {
    sleep: wearableData
      .filter((d: any) => d.event_type && d.event_type.includes('sleep'))
      .map((d: any) => d.payload as any)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    activity: wearableData
      .filter((d: any) => d.event_type && d.event_type.includes('activity'))
      .map((d: any) => d.payload as any)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    workouts: wearableData
      .filter((d: any) => d.event_type && d.event_type.includes('workout'))
      .map((d: any) => d.payload as any)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  };

  console.log('\n📊 Health data counts:');
  console.log(`   Sleep: ${healthData.sleep?.length || 0}`);
  console.log(`   Activity: ${healthData.activity?.length || 0}`);
  console.log(`   Workouts: ${healthData.workouts?.length || 0}`);

  if (healthData.workouts && healthData.workouts.length > 0) {
    const workout = healthData.workouts[0];
    console.log('\n🏃 Most recent workout (raw):');
    console.log(`   Title: ${workout.title}`);
    console.log(`   Sport (raw): ${JSON.stringify(workout.sport)}`);
    console.log(`   Sport type: ${typeof workout.sport}`);
    console.log(`   Duration: ${workout.duration}`);
    console.log(`   Moving time: ${workout.moving_time}`);

    // Test the fix
    const sport = typeof workout.sport === 'string' ? workout.sport : (workout.sport?.name || 'workout');
    const duration = workout.duration || (workout as any).moving_time || 0;
    const formatted = `Recent workout: ${workout.title} (${sport}), ${Math.round(duration / 60)} min`;

    console.log('\n✅ Fixed formatting:');
    console.log(`   ${formatted}`);
  }

  // Test calling the actual formatHealthDataForContext method
  console.log('\n🔍 Testing formatHealthDataForContext:');
  const context = (anthropicService as any).formatHealthDataForContext(healthData);
  console.log(context);

  process.exit(0);
}

testWorkoutDisplay();
