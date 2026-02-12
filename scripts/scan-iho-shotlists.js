#!/usr/bin/env node
/**
 * Scan IHO DT_PLAY_BY_PLAY files for a specific game and log all actions.
 * Run: node scripts/scan-iho-shotlists.js
 */
import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

const IHO_BASE = process.env.IHO_BASE_PATH || 'M:\\Incoming\\IHO';

// Target game — change these to scan a different matchup
const TARGET_HOME = 'CZE';
const TARGET_AWAY = 'CAN';

const parser = new XMLParser({ ignoreAttributes: false });

function attr(obj, key) {
  return obj?.['@_' + key] ?? obj?.[key];
}

function scanDir(dirPath) {
  try { return fs.readdirSync(dirPath); } catch { return []; }
}

/** Extract 3-letter team codes from the Actions Home/Away attributes (e.g. "IHOMTEAM6---CZE01" -> "CZE") */
function extractTeamCode(compCode) {
  if (!compCode) return '';
  const m = compCode.match(/---([A-Z]{3})/);
  return m ? m[1] : compCode.slice(-5, -2).toUpperCase();
}

/** Parse game clock "MM:SS" to total seconds for sorting */
function clockToSeconds(when) {
  if (!when) return 0;
  const parts = when.split(':');
  if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  return 0;
}

/** Period sort order: P1=1, P2=2, P3=3, OT=4, SO=5 */
function periodOrder(p) {
  if (!p) return 99;
  if (/^P(\d)$/i.test(p)) return parseInt(p.slice(1), 10);
  if (/^OT/i.test(p)) return 4;
  if (/^SO/i.test(p)) return 5;
  return 99;
}

function main() {
  console.log(`Scanning for ${TARGET_HOME} vs ${TARGET_AWAY} play-by-play in: ${IHO_BASE}\n`);

  if (!fs.existsSync(IHO_BASE)) {
    console.error('Folder does not exist:', IHO_BASE);
    process.exit(1);
  }

  const dateDirs = scanDir(IHO_BASE)
    .filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n))
    .sort((a, b) => b.localeCompare(a));

  // Find all DT_PLAY_BY_PLAY files for today (or most recent date)
  const pbpFiles = [];
  for (const dateDir of dateDirs.slice(0, 1)) {
    const datePath = path.join(IHO_BASE, dateDir);
    const hourDirs = scanDir(datePath).filter(n => /^\d+$/.test(n)).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
    for (const hourDir of hourDirs) {
      const hourPath = path.join(datePath, hourDir);
      const files = scanDir(hourPath).filter(f => f.includes('DT_PLAY_BY_PLAY'));
      for (const f of files) {
        pbpFiles.push({ path: path.join(hourPath, f), name: f, date: dateDir, hour: hourDir });
      }
    }
  }

  console.log(`Found ${pbpFiles.length} DT_PLAY_BY_PLAY files total.\n`);

  // Parse each file, find ones matching our target game.
  // Optimization: only read files whose name contains a matching document code pattern.
  const allActions = new Map(); // keyed by Id to deduplicate
  let gameInfo = null;
  let filesRead = 0;

  for (const file of pbpFiles) {
    try {
      filesRead++;
      const xml = fs.readFileSync(file.path, 'utf8');
      const parsed = parser.parse(xml);
      const body = parsed?.OdfBody;
      if (!body) continue;
      const comp = body.Competition;
      if (!comp) continue;

      const actions = comp.Actions;
      if (!actions) continue;

      const homeCode = extractTeamCode(attr(actions, 'Home'));
      const awayCode = extractTeamCode(attr(actions, 'Away'));

      // Check if this file is for our target game (either direction)
      const isTarget =
        (homeCode === TARGET_HOME && awayCode === TARGET_AWAY) ||
        (homeCode === TARGET_AWAY && awayCode === TARGET_HOME);

      if (!isTarget) continue;

      if (!gameInfo) {
        const extInfos = comp.ExtendedInfos;
        const sd = extInfos?.SportDescription;
        const vd = extInfos?.VenueDescription;
        gameInfo = {
          date: attr(body, 'Date') || '',
          home: homeCode,
          away: awayCode,
          event: sd ? (attr(sd, 'EventName') || '') : '',
          subEvent: sd ? (attr(sd, 'SubEventName') || '') : '',
          venue: vd ? (attr(vd, 'VenueName') || '') : '',
          resultStatus: attr(body, 'ResultStatus') || '',
        };
      }

      // Extract all actions
      const actionList = Array.isArray(actions.Action) ? actions.Action : (actions.Action ? [actions.Action] : []);
      for (const a of actionList) {
        const id = attr(a, 'Id');
        const period = attr(a, 'Period') || '';
        const order = parseInt(attr(a, 'Order'), 10) || 0;
        const action = attr(a, 'Action') || '';
        const when = attr(a, 'When') || '';
        const comment = attr(a, 'Comment') || '';
        const result = attr(a, 'Result') || '';
        const scoreH = attr(a, 'ScoreH');
        const scoreA = attr(a, 'ScoreA');
        const timestamp = attr(a, 'TimeStamp') || '';

        // Extract involved players
        const players = [];
        const competitor = a.Competitor;
        const compOrg = competitor ? (attr(competitor, 'Organisation') || extractTeamCode(attr(competitor, 'Code'))) : '';
        const composition = competitor?.Composition;
        const athletes = composition?.Athlete;
        const athleteArr = Array.isArray(athletes) ? athletes : (athletes ? [athletes] : []);
        for (const ath of athleteArr) {
          const desc = ath.Description;
          if (!desc) continue;
          const given = attr(desc, 'GivenName') || '';
          const family = attr(desc, 'FamilyName') || '';
          const role = attr(ath, 'Role') || '';
          const bib = attr(ath, 'Bib') || '';
          players.push({ name: `${given} ${family}`.trim(), role, bib, org: attr(desc, 'Organisation') || compOrg });
        }

        // Use highest version per action Id (latest file wins)
        const existing = allActions.get(id);
        if (!existing || order >= existing.order) {
          allActions.set(id, {
            id, period, order, action, when, comment, result,
            scoreH, scoreA, timestamp, team: compOrg, players
          });
        }
      }
    } catch (err) {
      // skip unreadable files
    }
  }

  console.log(`Files read: ${filesRead}, Actions found: ${allActions.size}`);

  if (!gameInfo) {
    console.log(`No DT_PLAY_BY_PLAY files found for ${TARGET_HOME} vs ${TARGET_AWAY}.`);
    return;
  }

  // Sort: period order, then game clock
  const sorted = [...allActions.values()].sort((a, b) => {
    const pd = periodOrder(a.period) - periodOrder(b.period);
    if (pd !== 0) return pd;
    return clockToSeconds(a.when) - clockToSeconds(b.when);
  });

  // Print header
  console.log('='.repeat(80));
  console.log(`  ${gameInfo.home} vs ${gameInfo.away}  —  ${gameInfo.event} ${gameInfo.subEvent}`);
  console.log(`  Date: ${gameInfo.date}   Venue: ${gameInfo.venue}   Status: ${gameInfo.resultStatus}`);
  console.log('='.repeat(80));
  console.log('');

  // Print actions grouped by period
  let currentPeriod = '';
  for (const a of sorted) {
    if (a.period !== currentPeriod) {
      currentPeriod = a.period;
      console.log(`\n--- ${currentPeriod} ${'—'.repeat(60)}`);
      console.log(`${'TIME'.padEnd(8)} ${'ACTION'.padEnd(14)} ${'TEAM'.padEnd(5)} ${'SCORE'.padEnd(8)} DETAILS`);
      console.log('-'.repeat(80));
    }

    const score = (a.scoreH != null && a.scoreA != null) ? `${a.scoreH}-${a.scoreA}` : '';
    const team = a.team || '';

    // Build details string
    let details = '';
    if (a.players.length > 0) {
      const playerStrs = a.players.map(p => {
        let s = p.name;
        if (p.role) s += ` (${p.role})`;
        if (p.bib) s += ` #${p.bib}`;
        return s;
      });
      details = playerStrs.join(', ');
    }
    if (a.comment && !details) {
      details = a.comment;
    }
    if (a.result && a.action === 'GOAL') {
      details += details ? ` [${a.result}]` : `[${a.result}]`;
    }

    // Timestamp (just the time portion)
    const ts = a.timestamp ? a.timestamp.split('T')[1]?.split('+')[0]?.slice(0, 8) || '' : '';
    const tsStr = ts ? `  (${ts} CET)` : '';

    console.log(`${(a.when || '').padEnd(8)} ${a.action.padEnd(14)} ${team.padEnd(5)} ${score.padEnd(8)} ${details}${tsStr}`);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Total actions: ${sorted.length}`);
}

main();
