const fs = require('fs'), p = require('path');
const { XMLParser } = require('fast-xml-parser');
const base = p.join('M:', 'Incoming', 'CUR', '2026-02-16');
const hours = fs.readdirSync(base).sort().reverse();

for (const h of hours) {
  const hp = p.join(base, h);
  const files = fs.readdirSync(hp);
  const f = files.find(f => f.includes('DT_RESULT_CURMTEAM'));
  if (!f) continue;

  const xml = fs.readFileSync(p.join(hp, f), 'utf-8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xml);
  const comp = doc.OdfBody.Competition;
  const results = Array.isArray(comp.Result) ? comp.Result : [comp.Result];

  // Both teams
  for (const r of results) {
    const c = r.Competitor;
    console.log('\n=== Team:', c['@_Organisation'], '===');
    const athletes = Array.isArray(c.Composition.Athlete) ? c.Composition.Athlete : [c.Composition.Athlete];
    athletes.forEach((a, i) => {
      const stats = a.StatsItems?.StatsItem;
      const statArr = Array.isArray(stats) ? stats : (stats ? [stats] : []);
      const eue = Array.isArray(a.EventUnitEntry) ? a.EventUnitEntry : (a.EventUnitEntry ? [a.EventUnitEntry] : []);
      const pos = eue.find(e => e['@_Code'] === 'POSITION');
      console.log(`  ${i + 1}. ${a.Description['@_GivenName']} ${a.Description['@_FamilyName']} | Pos: ${pos?.['@_Value']} | Stats: ${statArr.length}`);
      statArr.forEach(s => console.log(`     ${s['@_Code']} = ${s['@_Value']} (pct: ${s['@_Percent']})`));
    });
    // Coaches
    const coaches = c.Coaches?.Coach;
    const coachArr = Array.isArray(coaches) ? coaches : (coaches ? [coaches] : []);
    console.log('  Coaches:', coachArr.map(co => `${co.Description?.['@_GivenName']} ${co.Description?.['@_FamilyName']} (${co['@_Function']})`).join(', '));
  }

  // Officials
  if (comp.Officials) {
    const offs = Array.isArray(comp.Officials.Official) ? comp.Officials.Official : [comp.Officials.Official];
    console.log('\nOfficials:', offs.length);
    offs.forEach(o => console.log(`  ${o.Description?.['@_GivenName']} ${o.Description?.['@_FamilyName']} (${o['@_Function']})`));
  }
  break;
}

// Check DT_STATS
console.log('\n\n=== DT_STATS ===');
for (const h of hours) {
  const hp = p.join(base, h);
  const files = fs.readdirSync(hp);
  const sf = files.find(f => f.includes('DT_STATS_CURMTEAM'));
  if (!sf) continue;
  console.log('Stats file:', sf);
  const xml = fs.readFileSync(p.join(hp, sf), 'utf-8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xml);
  const body = doc.OdfBody;
  console.log('DocumentCode:', body['@_DocumentCode']);
  const comp = body.Competition;
  const results = Array.isArray(comp.Result) ? comp.Result : (comp.Result ? [comp.Result] : []);
  console.log('Results:', results.length);
  if (results.length > 0) {
    const r = results[0];
    console.log('First result keys:', Object.keys(r));
    const c = r.Competitor;
    if (c) {
      console.log('Competitor:', c['@_Organisation']);
      const stats = c.StatsItems?.StatsItem;
      const statArr = Array.isArray(stats) ? stats : (stats ? [stats] : []);
      console.log('Stats:', statArr.length);
      statArr.slice(0, 5).forEach(s => console.log(`  ${s['@_Code']} = ${s['@_Value']} (pct: ${s['@_Percent']}, rank: ${s['@_Rank']})`));
    }
  }
  break;
}

// Check DT_POOL_STANDING
console.log('\n\n=== DT_POOL_STANDING ===');
for (const h of hours) {
  const hp = p.join(base, h);
  const files = fs.readdirSync(hp);
  const pf = files.find(f => f.includes('DT_POOL_STANDING_CURMTEAM'));
  if (!pf) continue;
  console.log('Pool file:', pf);
  const xml = fs.readFileSync(p.join(hp, pf), 'utf-8');
  console.log(xml.substring(0, 2000));
  break;
}
