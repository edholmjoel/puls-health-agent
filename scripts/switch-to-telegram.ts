import '../src/config';
import supabaseService from '../src/services/supabase';

async function switchToTelegram() {
  const userId = '9ad88fdc-1b4f-4c85-98c3-ff4757e16a4f';

  const { data: user } = await (supabaseService as any).client
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  console.log('\n📊 Current settings:');
  console.log('   Platform:', user.platform);
  console.log('   Telegram ID:', user.telegram_user_id);
  console.log('   WhatsApp:', user.phone_number);

  if (!user.telegram_user_id) {
    console.log('\n❌ No Telegram user ID found. You need to connect via Telegram first.');
    process.exit(1);
  }

  console.log('\n🔄 Updating platform to telegram...');

  await (supabaseService as any).client
    .from('users')
    .update({ platform: 'telegram' })
    .eq('id', userId);

  console.log('✅ Platform updated to telegram!\n');
  console.log('Now re-run the onboarding test:');
  console.log('   npx tsx scripts/test-onboarding.ts\n');

  process.exit(0);
}

switchToTelegram();
