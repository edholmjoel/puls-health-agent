import '../src/config';
import supabaseService from '../src/services/supabase';

async function checkSummaryData() {
  const { data, error } = await (supabaseService as any).client
    .from('wearable_data')
    .select('event_type, received_at, payload')
    .eq('user_id', '9ad88fdc-1b4f-4c85-98c3-ff4757e16a4f')
    .or('event_type.ilike.%sleep%,event_type.ilike.%activity%,event_type.ilike.%workout%')
    .order('received_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log(`\n✅ Found ${data?.length || 0} summary data points\n`);

  const byType: Record<string, any[]> = {};
  (data || []).forEach((item: any) => {
    if (!byType[item.event_type]) {
      byType[item.event_type] = [];
    }
    byType[item.event_type].push(item);
  });

  Object.entries(byType).forEach(([type, items]) => {
    console.log(`\n${type}: ${items.length} records`);
    console.log(`  Latest: ${items[0].received_at}`);
    console.log(`  Oldest: ${items[items.length - 1].received_at}`);
    console.log(`  Sample payload:`, JSON.stringify(items[0].payload, null, 2));
  });

  process.exit(0);
}

checkSummaryData();
