import '../src/config';
import supabaseService from '../src/services/supabase';

async function inspectPayloads() {
  try {
    const { data: sleepData } = await (supabaseService as any).client
      .from('wearable_data')
      .select('event_type, payload, received_at')
      .eq('user_id', '9ad88fdc-1b4f-4c85-98c3-ff4757e16a4f')
      .ilike('event_type', '%sleep%')
      .limit(1);

    const { data: activityData } = await (supabaseService as any).client
      .from('wearable_data')
      .select('event_type, payload, received_at')
      .eq('user_id', '9ad88fdc-1b4f-4c85-98c3-ff4757e16a4f')
      .ilike('event_type', '%activity%')
      .limit(1);

    const { data: workoutData } = await (supabaseService as any).client
      .from('wearable_data')
      .select('event_type, payload, received_at')
      .eq('user_id', '9ad88fdc-1b4f-4c85-98c3-ff4757e16a4f')
      .ilike('event_type', '%workout%')
      .limit(1);

    console.log('\n📊 SLEEP PAYLOAD STRUCTURE:');
    console.log(JSON.stringify(sleepData?.[0], null, 2));

    console.log('\n📊 ACTIVITY PAYLOAD STRUCTURE:');
    console.log(JSON.stringify(activityData?.[0], null, 2));

    console.log('\n📊 WORKOUT PAYLOAD STRUCTURE:');
    console.log(JSON.stringify(workoutData?.[0], null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

inspectPayloads();
