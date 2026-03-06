import '../src/config';
import supabaseService from '../src/services/supabase';
import { DateTime } from 'luxon';

async function checkHistoricalData() {
  try {
    // Get all users
    const { data: users, error: usersError } = await (supabaseService as any).client
      .from('users')
      .select('id, name, junction_user_id, created_at')
      .not('junction_user_id', 'is', null);

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return;
    }

    console.log(`\n📊 Found ${users?.length || 0} users with Junction connections\n`);

    for (const user of users || []) {
      console.log(`\n👤 User: ${user.name} (${user.id})`);
      console.log(`   Created: ${user.created_at}`);
      console.log(`   Junction ID: ${user.junction_user_id}`);

      // Get wearable data statistics
      const { data: wearableData, error: dataError } = await (supabaseService as any).client
        .from('wearable_data')
        .select('event_type, received_at, payload')
        .eq('user_id', user.id)
        .order('received_at', { ascending: true });

      if (dataError) {
        console.error('   Error fetching wearable data:', dataError);
        continue;
      }

      if (!wearableData || wearableData.length === 0) {
        console.log('   ❌ No wearable data found');
        continue;
      }

      console.log(`\n   ✅ Total data points: ${wearableData.length}`);

      // Group by event type
      const byEventType: Record<string, any[]> = {};
      for (const item of wearableData) {
        const type = item.event_type || 'unknown';
        if (!byEventType[type]) {
          byEventType[type] = [];
        }
        byEventType[type].push(item);
      }

      console.log('\n   📈 Breakdown by event type:');
      for (const [eventType, items] of Object.entries(byEventType)) {
        const dates = items.map(i => i.received_at).sort();
        const earliest = dates[0];
        const latest = dates[dates.length - 1];
        const daysDiff = DateTime.fromISO(latest).diff(DateTime.fromISO(earliest), 'days').days;

        console.log(`      ${eventType}: ${items.length} records`);
        console.log(`         Earliest: ${earliest}`);
        console.log(`         Latest: ${latest}`);
        console.log(`         Range: ${daysDiff.toFixed(1)} days`);

        // Show sample data for each type
        if (items.length > 0) {
          const sample = items[0].payload as any;
          if (eventType.includes('sleep')) {
            console.log(`         Sample: ${(sample.total_sleep_duration_seconds / 3600).toFixed(1)}h sleep, ${sample.sleep_efficiency}% efficiency`);
          } else if (eventType.includes('activity')) {
            console.log(`         Sample: ${sample.steps} steps, ${sample.calories_total} cal`);
          } else if (eventType.includes('workout')) {
            console.log(`         Sample: ${sample.title || sample.sport}, ${((sample.time_total_seconds || 0) / 60).toFixed(0)} min`);
          }
        }
      }

      console.log('\n   ─────────────────────────────────────────');
    }

    console.log('\n✅ Analysis complete\n');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkHistoricalData();
