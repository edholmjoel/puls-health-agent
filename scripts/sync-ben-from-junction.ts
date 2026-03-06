import '../src/config';
import supabaseService from '../src/services/supabase';
import junctionService from '../src/services/junction';
import { DateTime } from 'luxon';

async function syncBenFromJunction() {
  const benJunctionId = '4d317ab1-b086-4b0f-b6d2-24db9be7fa6b';
  const benTelegramId = '7988727447';

  // Get Ben
  const { data: ben } = await (supabaseService as any).client
    .from('users')
    .select('*')
    .eq('telegram_user_id', benTelegramId)
    .single();

  console.log('\n👤 Ben:', ben.name);
  console.log('   User ID:', ben.id);
  console.log('   Junction ID:', benJunctionId);

  // Update Ben's junction_user_id
  await (supabaseService as any).client
    .from('users')
    .update({
      junction_user_id: benJunctionId,
      onboarding_complete: true,
    })
    .eq('id', ben.id);

  await (supabaseService as any).client
    .from('conversation_state')
    .update({ state: 'active' })
    .eq('user_id', ben.id);

  console.log('\n📥 Fetching data from Junction...');

  const endDate = DateTime.now().toISODate() as string;
  const startDate = DateTime.now().minus({ days: 60 }).toISODate() as string;

  let totalStored = 0;

  try {
    // Fetch workouts
    console.log('\n   🏃 Fetching workouts...');
    const workoutsResponse = await junctionService.getWorkoutsSummary(
      benJunctionId,
      startDate,
      endDate
    );
    const workouts = workoutsResponse.workouts || [];
    console.log(`   ✅ Found ${workouts.length} workouts`);

    // Store workouts
    for (const workout of workouts) {
      try {
        await supabaseService.storeWearableData({
          user_id: ben.id,
          junction_user_id: benJunctionId,
          event_type: 'daily.data.workouts.created',
          provider: 'strava',
          payload: workout,
        });
        totalStored++;
      } catch (error: any) {
        if (error.code !== '23505') { // Ignore duplicates
          console.log('      ⚠️  Error storing workout:', error.message);
        }
      }
    }
    console.log(`   💾 Stored ${totalStored} workouts\n`);

  } catch (error: any) {
    console.log('   ❌ Error fetching workouts:', error.message);
  }

  // Try sleep (will likely fail for Strava)
  try {
    console.log('   😴 Fetching sleep...');
    const sleepResponse = await junctionService.getSleepSummary(
      benJunctionId,
      startDate,
      endDate
    );
    const sleep = sleepResponse.sleep || [];
    console.log(`   ✅ Found ${sleep.length} sleep records`);

    for (const s of sleep) {
      try {
        await supabaseService.storeWearableData({
          user_id: ben.id,
          junction_user_id: benJunctionId,
          event_type: 'daily.data.sleep.created',
          provider: 'strava',
          payload: s,
        });
        totalStored++;
      } catch (error: any) {
        if (error.code !== '23505') {
          console.log('      ⚠️  Error storing sleep:', error.message);
        }
      }
    }
    console.log(`   💾 Stored ${sleep.length} sleep records\n`);
  } catch (error: any) {
    console.log('   ⚠️  No sleep data (expected for Strava)\n');
  }

  // Try activity
  try {
    console.log('   📊 Fetching activity...');
    const activityResponse = await junctionService.getActivitySummary(
      benJunctionId,
      startDate,
      endDate
    );
    const activity = activityResponse.activity || [];
    console.log(`   ✅ Found ${activity.length} activity records`);

    for (const a of activity) {
      try {
        await supabaseService.storeWearableData({
          user_id: ben.id,
          junction_user_id: benJunctionId,
          event_type: 'daily.data.activity.created',
          provider: 'strava',
          payload: a,
        });
        totalStored++;
      } catch (error: any) {
        if (error.code !== '23505') {
          console.log('      ⚠️  Error storing activity:', error.message);
        }
      }
    }
    console.log(`   💾 Stored ${activity.length} activity records\n`);
  } catch (error: any) {
    console.log('   ⚠️  No activity data (expected for Strava)\n');
  }

  console.log(`\n✅ Manual sync complete! Stored ${totalStored} total records`);
  console.log('\n📊 Verifying data...');

  // Check what we have
  const { data: storedData } = await (supabaseService as any).client
    .from('wearable_data')
    .select('event_type')
    .eq('user_id', ben.id);

  const types: Record<string, number> = {};
  storedData?.forEach((d: any) => {
    types[d.event_type] = (types[d.event_type] || 0) + 1;
  });

  console.log('\nData in database:');
  Object.entries(types).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });

  process.exit(0);
}

syncBenFromJunction();
