import '../src/config';
import supabaseService from '../src/services/supabase';

async function resetBen() {
  const { data: ben } = await (supabaseService as any).client
    .from('users')
    .select('id, name, telegram_user_id')
    .eq('name', 'Ben')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log('\n⚠️  Resetting Ben\'s connection...');
  console.log('   User ID:', ben.id);
  console.log('   Telegram ID:', ben.telegram_user_id);

  // Reset to awaiting_connection state
  await (supabaseService as any).client
    .from('users')
    .update({
      onboarding_complete: false,
      junction_user_id: null,
    })
    .eq('id', ben.id);

  await (supabaseService as any).client
    .from('conversation_state')
    .update({
      state: 'awaiting_connection',
      context: {},
    })
    .eq('user_id', ben.id);

  // Delete old wearable data
  await (supabaseService as any).client
    .from('wearable_data')
    .delete()
    .eq('user_id', ben.id);

  console.log('\n✅ Reset complete!');
  console.log('\n📱 Next steps:');
  console.log('   1. Tell Ben to send any message to the bot');
  console.log('   2. Bot will send him a NEW Vital Link');
  console.log('   3. He reconnects Strava');
  console.log('   4. Webhooks fire with FIXED code');
  console.log('   5. Onboarding triggers! 🎉\n');

  process.exit(0);
}

resetBen();
