import '../src/config';
import supabaseService from '../src/services/supabase';

async function checkEventTypes() {
  const data = await supabaseService.getWearableDataForUser(
    '9ad88fdc-1b4f-4c85-98c3-ff4757e16a4f',
    '2026-02-01',
    '2026-03-07'
  );

  const types = new Set(data.map(d => d.event_type));
  console.log('\nEvent types found:');
  Array.from(types).forEach(t => console.log(`  - ${t}`));

  console.log('\nEvent type counts:');
  const counts: Record<string, number> = {};
  data.forEach(d => {
    counts[d.event_type] = (counts[d.event_type] || 0) + 1;
  });
  Object.entries(counts).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  process.exit(0);
}

checkEventTypes();
