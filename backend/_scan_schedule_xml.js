/**
 * Scan M:\Incoming for DT_SCHEDULE and DT_SCHEDULE_UPDATE XML files.
 * Run: node _scan_schedule_xml.js [--quick]
 *   --quick: only scan known sport folders (OBS, GEN, SBD, IHO, CUR, etc.)
 */
import fs from 'fs';
import path from 'path';

const INCOMING_BASE = process.env.INCOMING_BASE || 'M:\\Incoming';
const OVR_BASE = process.env.OVR_BASE || 'M:\\OVR';
const SPORT_FOLDERS = ['OBS', 'GEN', 'SBD', 'IHO', 'CUR', 'SSK', 'STK', 'LUG', 'SKE', 'BOB', 'NOC'];
const useQuick = process.argv.includes('--quick');

function scanDir(dirPath, depth = 0, maxDepth = 4, onProgress = null) {
  if (depth > maxDepth) return [];
  const found = [];
  try {
    if (!fs.existsSync(dirPath)) return found;
    if (onProgress && depth <= 1) onProgress(dirPath);
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dirPath, e.name);
      if (e.isFile()) {
        if (e.name.includes('DT_SCHEDULE') && (e.name.endsWith('.xml') || e.name.includes('_'))) {
          const stat = fs.statSync(full);
          found.push({ path: full, name: e.name, mtime: stat.mtime, size: stat.size });
        }
      } else if (e.isDirectory() && !e.name.startsWith('.')) {
        found.push(...scanDir(full, depth + 1, maxDepth, onProgress));
      }
    }
  } catch (err) {
    console.error(`Error scanning ${dirPath}:`, err.message);
  }
  return found;
}

let found = [];
if (useQuick) {
  const bases = [INCOMING_BASE];
  process.stdout.write('Checking M:\\OVR... ');
  try {
    if (fs.existsSync(OVR_BASE)) { bases.push(OVR_BASE); console.log('found'); } else { console.log('not found'); }
  } catch (e) { console.log('error:', e.message); }
  console.log('Quick scan:', bases.join(', '), '→ OBS, GEN, sport folders\n');
  for (const base of bases) {
    for (const sport of SPORT_FOLDERS) {
      const dir = path.join(base, sport);
      process.stdout.write(`  Checking ${sport}... `);
      try {
        if (!fs.existsSync(dir)) { console.log('skip (not found)'); continue; }
      } catch (e) { console.log('error:', e.message); continue; }
      console.log('scanning');
      const before = found.length;
      found.push(...scanDir(dir, 0, 4, (p) => process.stdout.write(`    → ${path.relative(base, p)}\n`)));
      console.log(`    done: +${found.length - before} files`);
    }
  }
} else {
  console.log('Full recursive scan of', INCOMING_BASE, '...\n');
  found = scanDir(INCOMING_BASE);
}

// Group by parent folder (sport/type)
const byFolder = {};
for (const f of found) {
  const parts = f.path.split(path.sep);
  const parent = parts.length >= 2 ? parts[parts.length - 2] : 'root';
  const sportOrDate = parts.find(p => /^[A-Z]{2,4}$/.test(p)) || parent;
  const key = f.path.replace(INCOMING_BASE + path.sep, '').split(path.sep).slice(0, 3).join(path.sep);
  if (!byFolder[key]) byFolder[key] = [];
  byFolder[key].push(f);
}

console.log('Found', found.length, 'DT_SCHEDULE* file(s) in', Object.keys(byFolder).length, 'location(s):\n');
for (const [loc, files] of Object.entries(byFolder).sort()) {
  const sample = files[0];
  const dtSchedule = files.filter(f => f.name.includes('DT_SCHEDULE_') && !f.name.includes('_UPDATE')).length;
  const dtUpdate = files.filter(f => f.name.includes('DT_SCHEDULE_UPDATE')).length;
  console.log(loc);
  console.log('  DT_SCHEDULE:', dtSchedule, '| DT_SCHEDULE_UPDATE:', dtUpdate, '| Total:', files.length);
  console.log('  Sample:', sample.name, '|', (sample.size / 1024).toFixed(1), 'KB');
  console.log('');
}
