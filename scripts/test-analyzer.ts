import '../src/config';
import supabaseService from '../src/services/supabase';
import { dataAnalyzerService } from '../src/services/data-analyzer';
import { DateTime } from 'luxon';

async function testAnalyzer() {
  try {
    const userId = '9ad88fdc-1b4f-4c85-98c3-ff4757e16a4f'; // Joel
    const endDate = DateTime.now().toISODate() as string;
    const startDate = DateTime.now().minus({ days: 60 }).toISODate() as string;

    console.log('\n🔍 Fetching wearable data...');
    const wearableData = await supabaseService.getWearableDataForUser(
      userId,
      startDate,
      endDate
    );

    console.log(`✅ Found ${wearableData.length} data points\n`);

    console.log('🧠 Analyzing data...');
    const insights = await dataAnalyzerService.generateOnboardingInsights(wearableData);

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

testAnalyzer();
