import '../src/config';
import supabaseService from '../src/services/supabase';
import junctionService from '../src/services/junction';
import { DateTime } from 'luxon';

async function manualDataSync() {
  // Get Ben
  const { data: ben } = await (supabaseService as any).client
    .from('users')
    .select('*')
    .eq('telegram_user_id', '7988727447')
    .single();

  console.log('\n👤 Ben:', ben.name);
  console.log('   User ID:', ben.id);

  // Get all Junction users to find Ben's connection
  console.log('\n🔍 Finding Ben\'s Junction connection...');
  const junctionUsers = await junctionService.listUsers();

  console.log(`   Found ${junctionUsers.length} Junction users`);

  // Find Ben by matching phone or telegram
  const benJunctionUser = junctionUsers.find((u: any) =>
    u.client_user_id === '7988727447' ||
    u.client_user_id === ben.telegram_user_id?.toString()
  );

  if (!benJunctionUser) {
    console.log('\n❌ Ben not found in Junction!');
    console.log('   Available users:', junctionUsers.map((u: any) => ({
      client_user_id: u.client_user_id,
      user_id: u.user_id
    })));
    process.exit(1);
  }

  console.log('   ✅ Found:', benJunctionUser.user_id);

  // Update Ben's junction_user_id
  await (supabaseService as any).client
    .from('users')
    .update({ junction_user_id: benJunctionUser.user_id })
    .eq('id', ben.id);

  console.log('\n📥 Fetching data from Junction...');

  const endDate = DateTime.now().toISODate() as string;
  const startDate = DateTime.now().minus({ days: 60 }).toISODate() as string;

  try {
    // Fetch workouts
    console.log('   Fetching workouts...');
    const workouts = await junctionService.getWorkoutsSummary(
      benJunctionUser.user_id,
      startDate,
      endDate
    );
    console.log(`   ✅ ${workouts.length} workouts`);

    // Store workouts
    for (const workout of workouts) {
      await supabaseService.storeWearableData({
        user_id: ben.id,
        junction_user_id: benJunctionUser.user_id,
        event_type: 'daily.data.workouts.created',
        provider: 'strava',
        payload: workout,
      });
    }
    console.log(`   💾 Stored ${workouts.length} workouts`);

    // Fetch sleep
    console.log('   Fetching sleep...');
    try {
      const sleep = await junctionService.getSleepSummary(
        benJunctionUser.user_id,
        startDate,
        endDate
      );
      console.log(`   ✅ ${sleep.length} sleep records`);

      for (const s of sleep) {
        await supabaseService.storeWearableData({
          user_id: ben.id,
          junction_user_id: benJunctionUser.user_id,
          event_type: 'daily.data.sleep.created',
          provider: 'strava',
          payload: s,
        });
      }
      console.log(`   💾 Stored ${sleep.length} sleep records`);
    } catch (error) {
      console.log('   ⚠️  No sleep data (expected for Strava)');
    }

    // Fetch activity
    console.log('   Fetching activity...');
    try {
      const activity = await junctionService.getActivitySummary(
        benJunctionUser.user_id,
        startDate,
        endDate
      );
      console.log(`   ✅ ${activity.length} activity records`);

      for (const a of activity) {
        await supabaseService.storeWearableData({
          user_id: ben.id,
          junction_user_id: benJunctionUser.user_id,
          event_type: 'daily.data.activity.created',
          provider: 'strava',
          payload: a,
        });
      }
      console.log(`   💾 Stored ${activity.length} activity records`);
    } catch (error) {
      console.log('   ⚠️  No activity data (expected for Strava)');
    }

    console.log('\n✅ Manual sync complete!');
    console.log('\nNow run the onboarding test:');
    console.log('   npx tsx scripts/test-onboarding-ben.ts\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

manualDataSync();
