import '../src/config';
import supabaseService from '../src/services/supabase';
import junctionService from '../src/services/junction';

async function refreshBenData() {
  const { data: ben } = await (supabaseService as any).client
    .from('users')
    .select('*')
    .eq('name', 'Ben')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log('\n👤 Ben:');
  console.log('   Junction ID:', ben.junction_user_id);

  if (!ben.junction_user_id) {
    console.log('❌ No Junction ID!');
    process.exit(1);
  }

  try {
    console.log('\n🔄 Triggering manual data refresh...');
    await junctionService.refreshUserData(ben.junction_user_id);
    console.log('✅ Refresh triggered!');
    console.log('\n⏰ Wait 30-60 seconds, then check for data');
    console.log('   Run: npx tsx scripts/check-ben-data.ts');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.log('\nThis could mean:');
    console.log('- Strava connection is inactive');
    console.log('- User has no data on Strava');
    console.log('- Junction API issue');
  }

  process.exit(0);
}

refreshBenData();
