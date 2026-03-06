import '../src/config';
import supabaseService from '../src/services/supabase';

async function debugStravaData() {
  const { data: ben } = await (supabaseService as any).client
    .from('users')
    .select('id')
    .eq('name', 'Ben')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Get ALL events with full details
  const { data: allData } = await (supabaseService as any).client
    .from('wearable_data')
    .select('*')
    .eq('user_id', ben.id)
    .order('received_at', { ascending: false })
    .limit(10);

  console.log('\n📊 Latest 10 events from Strava:\n');

  allData.forEach((item: any, i: number) => {
    console.log(`${i + 1}. Event: ${item.event_type}`);
    console.log(`   Provider: ${item.provider}`);
    console.log(`   Received: ${item.received_at}`);
    console.log(`   Junction User: ${item.junction_user_id}`);

    if (item.payload) {
      const payload = item.payload as any;
      console.log(`   Payload keys:`, Object.keys(payload).join(', '));

      // Show relevant data
      if (payload.title || payload.sport || payload.type) {
        console.log(`   Title: ${payload.title || 'N/A'}`);
        console.log(`   Sport: ${payload.sport || payload.type || 'N/A'}`);
      }
      if (payload.timestamp || payload.time_start || payload.start_date) {
        console.log(`   Time: ${payload.timestamp || payload.time_start || payload.start_date}`);
      }
    }
    console.log('');
  });

  // Check unique event types
  const { data: allTypes } = await (supabaseService as any).client
    .from('wearable_data')
    .select('event_type')
    .eq('user_id', ben.id);

  const uniqueTypes = [...new Set(allTypes.map((d: any) => d.event_type))];
  console.log('🎯 All unique event types:');
  uniqueTypes.forEach(t => console.log(`   - ${t}`));

  process.exit(0);
}

debugStravaData();
