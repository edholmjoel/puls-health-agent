import '../src/config';
import supabaseService from '../src/services/supabase';
import { dataAnalyzerService } from '../src/services/data-analyzer';

async function testAnalyzerDirect() {
  try {
    // Get summary data directly without date filtering
    const { data: wearableData, error } = await (supabaseService as any).client
      .from('wearable_data')
      .select('*')
      .eq('user_id', '9ad88fdc-1b4f-4c85-98c3-ff4757e16a4f')
      .or('event_type.ilike.%sleep%,event_type.ilike.%activity%,event_type.ilike.%workout%');

    if (error) {
      console.error('Error:', error);
      process.exit(1);
    }

    console.log(`\n✅ Found ${wearableData?.length || 0} summary data points\n`);

    console.log('🧠 Analyzing data...');
    const insights = await dataAnalyzerService.generateOnboardingInsights(wearableData || []);

    console.log('\n📊 ONBOARDING INSIGHTS:\n');
    console.log('Fitness Level:', insights.fitnessLevel);
    console.log('Workout Style:', insights.workoutStyle);
    console.log('Sleep Pattern:', insights.sleepPattern);
    console.log('\n🏆 ACHIEVEMENTS:');
    insights.achievements.forEach((achievement, i) => {
      console.log(`  ${i + 1}. ${achievement}`);
    });

    console.log('\n✅ Analysis complete\n');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testAnalyzerDirect();
