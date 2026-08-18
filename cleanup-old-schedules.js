#!/usr/bin/env node
/**
 * Cleanup Old Schedules Script
 * Archives all old schedules in Supabase and logs the result.
 * Safe to run: only archives, doesn't delete data.
 * 
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanupSchedules() {
  try {
    console.log('🔄 Starting archive of old schedules...\n');

    // Archive all active schedules
    const { data, error } = await supabase
      .from('lab_schedules')
      .update({
        status: 'archived',
        archived_at: new Date().toISOString()
      })
      .eq('status', 'active')
      .select('id, day_name, subject, start_time, end_time, semester_label');

    if (error) {
      console.error('❌ Error archiving schedules:', error.message);
      process.exit(1);
    }

    const count = data?.length || 0;
    console.log(`✅ Successfully archived ${count} schedule(s)\n`);

    if (count > 0) {
      console.log('Archived schedules:');
      data.forEach((item, i) => {
        console.log(
          `  ${i + 1}. ${item.day_name} ${item.start_time}-${item.end_time} | ` +
          `${item.subject} (${item.semester_label})`
        );
      });
    }

    console.log('\n✨ Cleanup complete. Old schedules are now archived.');
    console.log('   New bookings will start fresh without old data conflicts.\n');
  } catch (error) {
    console.error('💥 Unexpected error:', error.message);
    process.exit(1);
  }
}

cleanupSchedules();
