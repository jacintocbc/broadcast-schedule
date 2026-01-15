import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function bulkInsertEncoders() {
  console.log('📝 Inserting encoders (TX 01 - TX 27)...');
  
  const encoders = [];
  for (let i = 1; i <= 27; i++) {
    const num = i.toString().padStart(2, '0');
    encoders.push({ name: `TX ${num}` });
  }
  
  const { data, error } = await supabase
    .from('encoders')
    .insert(encoders)
    .select();
  
  if (error) {
    if (error.code === '23505') {
      console.log('⚠️  Some encoders already exist (duplicate key error). Skipping...');
      // Try inserting one by one to handle duplicates gracefully
      let successCount = 0;
      let skipCount = 0;
      for (const encoder of encoders) {
        const { error: insertError } = await supabase
          .from('encoders')
          .insert(encoder)
          .select();
        if (insertError) {
          if (insertError.code === '23505') {
            skipCount++;
          } else {
            console.error(`❌ Error inserting ${encoder.name}:`, insertError.message);
          }
        } else {
          successCount++;
        }
      }
      console.log(`✅ Inserted ${successCount} encoders, skipped ${skipCount} duplicates`);
    } else {
      console.error('❌ Error inserting encoders:', error.message);
      return false;
    }
  } else {
    console.log(`✅ Successfully inserted ${data.length} encoders`);
  }
  return true;
}

async function bulkInsertBooths() {
  console.log('📝 Inserting booths (VT 51 - VT 62)...');
  
  const booths = [];
  for (let i = 51; i <= 62; i++) {
    booths.push({ name: `VT ${i}` });
  }
  
  const { data, error } = await supabase
    .from('booths')
    .insert(booths)
    .select();
  
  if (error) {
    if (error.code === '23505') {
      console.log('⚠️  Some booths already exist (duplicate key error). Skipping...');
      // Try inserting one by one to handle duplicates gracefully
      let successCount = 0;
      let skipCount = 0;
      for (const booth of booths) {
        const { error: insertError } = await supabase
          .from('booths')
          .insert(booth)
          .select();
        if (insertError) {
          if (insertError.code === '23505') {
            skipCount++;
          } else {
            console.error(`❌ Error inserting ${booth.name}:`, insertError.message);
          }
        } else {
          successCount++;
        }
      }
      console.log(`✅ Inserted ${successCount} booths, skipped ${skipCount} duplicates`);
    } else {
      console.error('❌ Error inserting booths:', error.message);
      return false;
    }
  } else {
    console.log(`✅ Successfully inserted ${data.length} booths`);
  }
  return true;
}

async function main() {
  console.log('🚀 Starting bulk insert...\n');
  
  const encoderSuccess = await bulkInsertEncoders();
  console.log('');
  const boothSuccess = await bulkInsertBooths();
  
  console.log('\n✨ Bulk insert complete!');
  
  if (encoderSuccess && boothSuccess) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
