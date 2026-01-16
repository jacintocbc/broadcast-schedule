import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function bulkInsert() {
  console.log('🚀 Starting bulk insert for suites and commentators...');

  // Suites: Remove duplicate "Copper"
  const suitesToInsert = [
    'Copper',
    'Gold',
    'Brown',
    'Cyan',
    'Indigo',
    'Navy',
    'Green',
    'Aqua'
  ];

  console.log('\n📝 Inserting suites...');
  for (const suite of suitesToInsert) {
    const { error } = await supabase.from('suites').upsert(
      { name: suite },
      { onConflict: 'name', ignoreDuplicates: true }
    );
    if (error && error.code !== '23505') {
      console.error(`Error inserting suite ${suite}:`, error.message);
    } else if (!error) {
      console.log(`  ✅ ${suite}`);
    }
  }
  console.log(`✅ Successfully processed ${suitesToInsert.length} suites`);

  // Commentators: Extract unique names with P or C suffix
  const commentatorsToInsert = [
    'Daniella Ponticelli (P)',
    'Becky Kellar (C)',
    'Matt Cullen (P)',
    'Brenda Irving (P)',
    'Kurt Browning (C)',
    'Carol Lane (C)',
    'Sandra Bezic (C)',
    'Bruce Rainnie (P)',
    'Mike Harris (C)',
    'Jennifer Jones (C)',
    'Joanne Courtney (C)',
    'Signa Butler (P)',
    'Anastasia Bucsis (C)',
    'Michael Gilday (C)',
    'Brian Stemmle (P)',
    'Erin Mielzynski (C)',
    'Mark Lee (P)',
    'Mellisa Hollingsworth (C)',
    'Helen Upperton (C)',
    'Alex Despatie (P)',
    'Philippe Marquis (C)',
    'Deidra Dionne (C)',
    'Mike Atkinson (P)',
    'Kaya Turski (C)',
    'Kelsey Serwa (C)',
    'Adam Higgins (C)',
    'Rob Snoek (P)',
    'Craig McMorris (C)'
  ];

  console.log('\n📝 Inserting commentators...');
  for (const commentator of commentatorsToInsert) {
    const { error } = await supabase.from('commentators').upsert(
      { name: commentator },
      { onConflict: 'name', ignoreDuplicates: true }
    );
    if (error && error.code !== '23505') {
      console.error(`Error inserting commentator ${commentator}:`, error.message);
    } else if (!error) {
      console.log(`  ✅ ${commentator}`);
    }
  }
  console.log(`✅ Successfully processed ${commentatorsToInsert.length} commentators`);

  console.log('\n✨ Bulk insert complete!');
}

bulkInsert().catch(console.error);
