import '../src/config';
import supabaseService from '../src/services/supabase';

async function checkWorkoutPayload() {
  const { data } = await (supabaseService as any).client
    .from('wearable_data')
    .select('payload, event_type')
    .eq('user_id', 'a850945c-caa6-4cc3-83c3-24ccc3f6989f')
    .limit(1)
    .single();

  console.log('\nEvent type:', data.event_type);
  console.log('\nPayload structure:');
  console.log(JSON.stringify(data.payload, null, 2));

  process.exit(0);
}

checkWorkoutPayload();
