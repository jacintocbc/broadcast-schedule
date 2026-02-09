import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { XMLParser } from 'fast-xml-parser';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
// Configure CORS to allow all methods and headers
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
app.use(express.json());

// Handle preflight requests explicitly
app.options('*', cors());

// In-memory storage for events (can be replaced with events.json file)
let eventsData = [];

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Ensure data directory exists for static CSV files
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

/**
 * Convert DD/MM/YYYY date and HH:MM:SS time (in Rome timezone) to ISO timestamp (UTC)
 * CSV times are in Rome time (Europe/Rome - CET/CEST)
 */
function combineDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) {
    throw new Error('Date and time strings are required');
  }
  
  // Parse DD/MM/YYYY
  const dateParts = dateStr.split('/');
  if (dateParts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}. Expected DD/MM/YYYY`);
  }
  const [day, month, year] = dateParts;
  
  // Parse HH:MM:SS
  const timeParts = timeStr.split(':');
  if (timeParts.length < 2) {
    throw new Error(`Invalid time format: ${timeStr}. Expected HH:MM:SS`);
  }
  const [hours, minutes, seconds = '00'] = timeParts;
  
  // Validate and parse
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);
  const dayNum = parseInt(day, 10);
  const hoursNum = parseInt(hours, 10);
  const minutesNum = parseInt(minutes, 10);
  const secondsNum = parseInt(seconds, 10);
  
  if (isNaN(yearNum) || isNaN(monthNum) || isNaN(dayNum) || 
      isNaN(hoursNum) || isNaN(minutesNum) || isNaN(secondsNum)) {
    throw new Error(`Invalid date/time values: ${dateStr} ${timeStr}`);
  }
  
  // Create date assuming it's in Rome timezone (Europe/Rome)
  // Rome is UTC+1 (CET) or UTC+2 (CEST) depending on DST
  // We'll create a date string and manually calculate the UTC equivalent
  // For February 2026, Rome is in CET (UTC+1, no DST in winter)
  // DST in Europe typically starts last Sunday of March and ends last Sunday of October
  
  // Determine if DST is active (simplified: March-October = CEST, otherwise CET)
  const isDST = monthNum >= 3 && monthNum <= 10;
  // More precise: check if after last Sunday of March and before last Sunday of October
  // For simplicity, using month-based check
  const romeOffsetHours = isDST ? 2 : 1; // CEST = UTC+2, CET = UTC+1
  
  // Create the date as if it were UTC, then subtract the Rome offset to get actual UTC
  const utcDate = new Date(Date.UTC(
    yearNum,
    monthNum - 1, // Month is 0-indexed
    dayNum,
    hoursNum - romeOffsetHours, // Subtract Rome offset to get UTC
    minutesNum,
    secondsNum
  ));
  
  // Validate the date
  if (isNaN(utcDate.getTime())) {
    throw new Error(`Invalid date created from: ${dateStr} ${timeStr}`);
  }
  
  return utcDate.toISOString();
}

/**
 * Get column value with flexible matching (case-insensitive, handles spaces)
 */
function getColumnValue(row, possibleNames) {
  const keys = Object.keys(row);
  
  // Try exact match first
  for (const name of possibleNames) {
    if (row[name] !== undefined) {
      return row[name]?.trim() || '';
    }
  }
  
  // Try case-insensitive match
  for (const name of possibleNames) {
    const normalizedName = name.toLowerCase().replace(/\s+/g, '');
    for (const key of keys) {
      const normalizedKey = key.toLowerCase().replace(/\s+/g, '');
      if (normalizedName === normalizedKey) {
        return row[key]?.trim() || '';
      }
    }
  }
  
  return '';
}

/**
 * Transform CSV row to event object
 */
function transformRow(row) {
  const id = getColumnValue(row, ['Id', 'ID', 'id']);
  const channelName = getColumnValue(row, ['ChannelName', 'Channel Name', 'channelname']);
  const title = getColumnValue(row, ['Title', 'title']);
  const date = getColumnValue(row, ['Date', 'date']);
  const txStartTime = getColumnValue(row, ['Tx Start Time', 'TxStartTime', 'tx start time', 'TX Start Time']);
  const txEndTime = getColumnValue(row, ['Tx End Time', 'TxEndTime', 'tx end time', 'TX End Time']);
  const txDuration = getColumnValue(row, ['Tx Duration', 'TxDuration', 'tx duration', 'TX Duration']);
  
  if (!id || !date || !txStartTime || !txEndTime) {
    return null; // Skip invalid rows
  }
  
  try {
    // Parse start time
    const startParts = txStartTime.split(':');
    const startHours = parseInt(startParts[0], 10);
    const startMinutes = parseInt(startParts[1] || '0', 10);
    const startSeconds = parseInt(startParts[2] || '0', 10);
    
    const normalizedStartTime = `${startHours.toString().padStart(2, '0')}:${startMinutes.toString().padStart(2, '0')}:${startSeconds.toString().padStart(2, '0')}`;
    const startTime = combineDateTime(date, normalizedStartTime);
    const startDate = new Date(startTime);
    
    // Calculate end time using duration if available (more reliable)
    let endTime;
    if (txDuration) {
      // Parse duration (format: HH:MM:SS)
      const durationParts = txDuration.split(':');
      const durationHours = parseInt(durationParts[0], 10) || 0;
      const durationMinutes = parseInt(durationParts[1], 10) || 0;
      const durationSeconds = parseInt(durationParts[2], 10) || 0;
      
      // Calculate end time by adding duration to start time
      const endDate = new Date(startDate);
      endDate.setUTCHours(endDate.getUTCHours() + durationHours);
      endDate.setUTCMinutes(endDate.getUTCMinutes() + durationMinutes);
      endDate.setUTCSeconds(endDate.getUTCSeconds() + durationSeconds);
      
      endTime = endDate.toISOString();
    } else {
      // Fallback to parsing end time directly if duration not available
      const endParts = txEndTime.split(':');
      let endHours = parseInt(endParts[0], 10);
      const endMinutes = parseInt(endParts[1] || '0', 10);
      const endSeconds = parseInt(endParts[2] || '0', 10);
      
      // If end hour is single digit (1-9) and less than start hour, it's likely next day
      let normalizedEndHours = endHours;
      if (endHours >= 1 && endHours <= 9 && endHours < startHours) {
        // Keep as-is (will be next day)
        normalizedEndHours = endHours;
      }
      
      const normalizedEndTime = `${normalizedEndHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}:${endSeconds.toString().padStart(2, '0')}`;
      endTime = combineDateTime(date, normalizedEndTime);
      
      // If end time is earlier than start time, it's the next day
      const endDate = new Date(endTime);
      if (endDate < startDate) {
        const nextDay = new Date(startDate);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        endTime = new Date(Date.UTC(
          nextDay.getUTCFullYear(),
          nextDay.getUTCMonth(),
          nextDay.getUTCDate(),
          normalizedEndHours,
          endMinutes,
          endSeconds
        )).toISOString();
      }
    }
    
    // Store all CSV data for detail view
    const event = {
      id,
      group: channelName,
      title,
      start_time: startTime,
      end_time: endTime,
      // Store all original CSV fields
      rawData: {}
    };
    
    // Copy all CSV columns to rawData
    Object.keys(row).forEach(key => {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
        event.rawData[key.trim()] = row[key].trim();
      }
    });
    
    // Also extract commonly used fields for easier access
    event.date = date;
    event.txStartTime = txStartTime;
    event.txEndTime = txEndTime;
    event.txType = getColumnValue(row, ['Tx Type', 'TxType', 'tx type']);
    event.txDuration = getColumnValue(row, ['Tx Duration', 'TxDuration', 'tx duration']);
    event.videoFeed = getColumnValue(row, ['VideoFeed', 'Video Feed', 'videofeed']);
    event.source = getColumnValue(row, ['Source', 'source']);
    event.rights = getColumnValue(row, ['Rights', 'rights']);
    event.gamesDay = getColumnValue(row, ['GamesDay', 'Games Day', 'gamesday']);
    
    return event;
  } catch (error) {
    console.error('Error transforming row:', error, { id, date, txStartTime, txEndTime });
    return null;
  }
}

/**
 * Process CSV file content and return transformed events
 */
function processCSVContent(fileContent) {
  if (!fileContent || typeof fileContent !== 'string') {
    throw new Error('Invalid file content');
  }
  
  // Remove BOM if present
  if (fileContent.length > 0 && fileContent.charCodeAt(0) === 0xFEFF) {
    fileContent = fileContent.slice(1);
  }
  
  if (fileContent.trim().length === 0) {
    throw new Error('CSV file is empty');
  }
  
  let records;
  try {
    records = parse(fileContent, {
      columns: (header) => {
        if (!header || !Array.isArray(header)) {
          throw new Error('Invalid CSV header');
        }
        // Remove BOM and trim from all column names
        return header.map(col => {
          if (!col || typeof col !== 'string') {
            return '';
          }
          // Remove BOM character if present
          if (col.length > 0 && col.charCodeAt(0) === 0xFEFF) {
            col = col.slice(1);
          }
          return col.trim();
        });
      },
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    });
  } catch (parseError) {
    console.error('CSV parse error:', parseError);
    throw new Error(`Failed to parse CSV: ${parseError.message}`);
  }
  
  if (!records || records.length === 0) {
    console.warn('No records found in CSV file');
    return {
      events: [],
      stats: {
        totalRows: 0,
        validCount: 0,
        invalidCount: 0
      }
    };
  }
  
  // Log column names for debugging
  console.log('CSV Column names:', Object.keys(records[0]));
  console.log('Total rows parsed:', records.length);
  
  // Transform records
  let validCount = 0;
  let invalidCount = 0;
  const transformedEvents = records.map((row, index) => {
    try {
      const event = transformRow(row);
      if (event === null) {
        invalidCount++;
        if (invalidCount <= 5) { // Log first 5 invalid rows for debugging
          console.log(`Invalid row ${index + 1}:`, {
            Id: getColumnValue(row, ['Id', 'ID', 'id']),
            Date: getColumnValue(row, ['Date', 'date']),
            'Tx Start Time': getColumnValue(row, ['Tx Start Time', 'TxStartTime']),
            'Tx End Time': getColumnValue(row, ['Tx End Time', 'TxEndTime']),
            allKeys: Object.keys(row)
          });
        }
      } else {
        validCount++;
      }
      return event;
    } catch (error) {
      invalidCount++;
      console.error(`Error transforming row ${index + 1}:`, error.message);
      return null;
    }
  }).filter(event => event !== null); // Remove invalid rows
  
  console.log(`Processed ${records.length} rows: ${validCount} valid, ${invalidCount} invalid`);
  
  return {
    events: transformedEvents,
    stats: {
      totalRows: records.length,
      validCount,
      invalidCount
    }
  };
}

// POST /api/upload - Handle CSV file upload
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  try {
    const fileContent = fs.readFileSync(req.file.path, 'utf-8');
    const result = processCSVContent(fileContent);
    
    // Store in memory
    eventsData = result.events;
    
    // Also save to events.json for persistence
    const eventsJsonPath = path.join(__dirname, 'events.json');
    fs.writeFileSync(eventsJsonPath, JSON.stringify(eventsData, null, 2));
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json({
      message: 'File uploaded and processed successfully',
      count: result.events.length,
      ...result.stats
    });
  } catch (error) {
    console.error('Error processing CSV:', error);
    console.error('Error stack:', error.stack);
    
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Error processing CSV file', details: error.message });
  }
});

// POST /api/load-static - Load CSV from static file in data directory
app.post('/api/load-static', async (req, res) => {
  console.log('POST /api/load-static called');
  try {
    // Look for CSV files in the data directory
    if (!fs.existsSync(dataDir)) {
      return res.status(500).json({ 
        error: 'Data directory does not exist',
        message: `Data directory not found: ${dataDir}`
      });
    }
    
    const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.csv'));
    
    if (files.length === 0) {
      return res.status(404).json({ 
        error: 'No CSV file found in data directory',
        message: `Please place a CSV file in: ${dataDir}`
      });
    }
    
    // Use the first CSV file found, or allow specifying filename
    const filename = (req.body && req.body.filename) ? req.body.filename : files[0];
    const filePath = path.join(dataDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        error: 'File not found',
        availableFiles: files,
        requestedFile: filename
      });
    }
    
    console.log(`Loading static CSV file: ${filename}`);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    
    if (!fileContent || fileContent.trim().length === 0) {
      return res.status(400).json({ 
        error: 'CSV file is empty'
      });
    }
    
    const result = processCSVContent(fileContent);
    
    // Store in memory
    eventsData = result.events;
    
    // Also save to events.json for persistence
    const eventsJsonPath = path.join(__dirname, 'events.json');
    fs.writeFileSync(eventsJsonPath, JSON.stringify(eventsData, null, 2));
    
    res.json({
      message: 'Static file loaded and processed successfully',
      filename,
      count: result.events.length,
      ...result.stats
    });
  } catch (error) {
    console.error('Error loading static CSV:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Error processing CSV file', details: error.message });
  }
});

// GET /api/events - Return all events (optionally filtered by date)
app.get('/api/events', (req, res) => {
  try {
    // Try to load from events.json if in-memory is empty
    if (eventsData.length === 0) {
      const eventsJsonPath = path.join(__dirname, 'events.json');
      if (fs.existsSync(eventsJsonPath)) {
        try {
          const fileContent = fs.readFileSync(eventsJsonPath, 'utf-8');
          if (fileContent.trim()) {
            eventsData = JSON.parse(fileContent);
          }
        } catch (error) {
          console.error('Error reading events.json:', error);
          // If events.json is corrupted, reset it
          eventsData = [];
        }
      }
    }
    
    // Filter by date if provided
    let filteredEvents = eventsData;
    if (req.query.date) {
      const filterDate = new Date(req.query.date);
      filterDate.setUTCHours(0, 0, 0, 0);
      const nextDay = new Date(filterDate);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      
      filteredEvents = eventsData.filter(event => {
        const eventStart = new Date(event.start_time);
        const eventEnd = new Date(event.end_time);
        // Include events that overlap with the selected day
        return (eventStart < nextDay && eventEnd > filterDate);
      });
    }
    
    res.json(filteredEvents);
  } catch (error) {
    console.error('Error in /api/events:', error);
    res.status(500).json({ error: 'Error fetching events', details: error.message });
  }
});

// GET /api/events/dates - Get list of available dates
app.get('/api/events/dates', (req, res) => {
  try {
    // Try to load from events.json if in-memory is empty
    if (eventsData.length === 0) {
      const eventsJsonPath = path.join(__dirname, 'events.json');
      if (fs.existsSync(eventsJsonPath)) {
        try {
          const fileContent = fs.readFileSync(eventsJsonPath, 'utf-8');
          if (fileContent.trim()) {
            eventsData = JSON.parse(fileContent);
          }
        } catch (error) {
          console.error('Error reading events.json:', error);
          eventsData = [];
        }
      }
    }
    
    // Extract unique dates from events
    const dates = new Set();
    eventsData.forEach(event => {
      const eventDate = new Date(event.start_time);
      eventDate.setUTCHours(0, 0, 0, 0);
      dates.add(eventDate.toISOString().split('T')[0]);
    });
    
    const sortedDates = Array.from(dates).sort();
    res.json(sortedDates);
  } catch (error) {
    console.error('Error in /api/events/dates:', error);
    res.status(500).json({ error: 'Error fetching dates', details: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ============================================
// IHO DT_RESULT Live Feed
// ============================================
const IHO_BASE_PATH = process.env.IHO_BASE_PATH || 'M:\\Incoming\\IHO';

/**
 * Resolve path to newest date folder, then newest holder folder.
 * Returns full path to holder folder or null if not found.
 */
function resolveIHOHolderPath() {
  if (!fs.existsSync(IHO_BASE_PATH)) {
    return null;
  }
  const dateDirs = fs.readdirSync(IHO_BASE_PATH, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
    .sort((a, b) => b.name.localeCompare(a.name));
  if (dateDirs.length === 0) return null;
  const datePath = path.join(IHO_BASE_PATH, dateDirs[0].name);
  const holderDirs = fs.readdirSync(datePath, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d+$/.test(d.name))
    .sort((a, b) => parseInt(b.name, 10) - parseInt(a.name, 10));
  if (holderDirs.length === 0) return null;
  return path.join(datePath, holderDirs[0].name);
}

/**
 * List all DT_RESULT_* files in folder, sorted by mtime newest first.
 * Returns array of { path, mtime }.
 */
function listDTResultFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(f => f.includes('DT_RESULT_'))
    .map(f => ({ name: f, path: path.join(dirPath, f) }))
    .filter(f => fs.statSync(f.path).isFile())
    .map(f => ({ ...f, mtime: fs.statSync(f.path).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
}

/**
 * Find file matching *DT_RESULT_* in folder. If home/away provided, find first file
 * whose parsed data matches those team codes. Otherwise return newest.
 */
function findDTResultFile(dirPath, homeCode, awayCode) {
  const files = listDTResultFiles(dirPath);
  if (files.length === 0) return null;
  const home = homeCode?.trim()?.toUpperCase();
  const away = awayCode?.trim()?.toUpperCase();
  const wantMatch = home && away;
  for (const { path: filePath, mtime } of files) {
    try {
      const xmlStr = fs.readFileSync(filePath, 'utf-8');
      const data = parseDTResultXml(xmlStr);
      const dataHome = data.homeTeam?.code?.toUpperCase();
      const dataAway = data.awayTeam?.code?.toUpperCase();
      if (!wantMatch) return { path: filePath, mtime, data };
      if ((dataHome === home && dataAway === away) || (dataHome === away && dataAway === home)) {
        return { path: filePath, mtime, data };
      }
    } catch (_) {
      continue;
    }
  }
  const { path: filePath, mtime } = files[0];
  const xmlStr = fs.readFileSync(filePath, 'utf-8');
  const data = parseDTResultXml(xmlStr);
  return { path: filePath, mtime, data };
}

/**
 * Extract stat value from StatsItems by Code and Pos.
 * StatsItem attributes come from fast-xml-parser as @_Code, @_Pos, @_Value.
 */
function getStatValue(statsItems, code, pos = 'TOT') {
  if (!statsItems || !Array.isArray(statsItems)) return null;
  const item = statsItems.find(s => {
    const c = s['@_Code'] ?? s.Code;
    const p = s['@_Pos'] ?? s.Pos;
    return c === code && (p === pos || (p == null && pos === 'TOT'));
  });
  if (!item) return null;
  const v = item['@_Value'] ?? item.Value;
  return v !== undefined && v !== null ? v : null;
}

/**
 * Parse DT_RESULT XML and return normalized payload.
 */
function parseDTResultXml(xmlStr) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xmlStr);
  const body = doc?.OdfBody;
  if (!body) throw new Error('Invalid OdfBody structure');

  const comp = body.Competition;
  if (!comp) throw new Error('Missing Competition');

  const extInfos = comp.ExtendedInfos;
  const extInfo = Array.isArray(extInfos?.ExtendedInfo) ? extInfos.ExtendedInfo : (extInfos?.ExtendedInfo ? [extInfos.ExtendedInfo] : []);
  const periodInfo = extInfo.find(e => e['@_Code'] === 'PERIOD');
  const extInfosObj = comp.ExtendedInfos || {};
  const sportDesc = extInfosObj.SportDescription || comp.SportDescription || {};
  const venueDesc = extInfosObj.VenueDescription || comp.VenueDescription || {};
  const attr = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const periods = comp.Periods;
  const periodList = Array.isArray(periods?.Period) ? periods.Period : (periods?.Period ? [periods.Period] : []);

  const results = comp.Result;
  const resultList = Array.isArray(results) ? results : (results ? [results] : []);
  const competitors = resultList.flatMap(r => Array.isArray(r.Competitor) ? r.Competitor : (r.Competitor ? [r.Competitor] : []));

  const homeComp = competitors.find(c => {
    const eue = c.EventUnitEntry || [];
    const entries = Array.isArray(eue) ? eue : [eue];
    return entries.some(e => e['@_Code'] === 'HOME_AWAY' && e['@_Value'] === 'HOME');
  });
  const awayComp = competitors.find(c => {
    const eue = c.EventUnitEntry || [];
    const entries = Array.isArray(eue) ? eue : [eue];
    return entries.some(e => e['@_Code'] === 'HOME_AWAY' && e['@_Value'] === 'AWAY');
  });

  const toTeam = (c, sortOrder) => {
    if (!c) return null;
    const desc = c.Description || {};
    const teamName = desc['@_TeamName'] ?? desc.TeamName ?? '';
    const stats = c.StatsItems?.StatsItem;
    const statsArr = Array.isArray(stats) ? stats : (stats ? [stats] : []);
    const result = resultList.find(r => String(r['@_SortOrder']) === String(sortOrder)) || {};
    const periodEntry = periodList.find(p => (p['@_Code'] ?? p.Code) === (periodInfo?.['@_Value'] || 'P1'));
    return {
      name: teamName || '',
      code: c['@_Organisation'] || '',
      score: parseInt(result['@_Result'], 10) ?? 0,
      periodScore: parseInt(attr(periodEntry, sortOrder === 1 ? 'HomePeriodScore' : 'AwayPeriodScore'), 10) ?? 0,
      sog: parseInt(getStatValue(statsArr, 'SOG'), 10) ?? 0,
      gf: parseInt(getStatValue(statsArr, 'GF'), 10) ?? 0,
      fo: getStatValue(statsArr, 'FO'),
      foPercent: (() => { const item = statsArr.find(s => (s['@_Code'] ?? s.Code) === 'FO'); return item?.['@_Percent']; })(),
      ppg: parseInt(getStatValue(statsArr, 'PPG'), 10) ?? 0,
      pim: parseInt(getStatValue(statsArr, 'PIM'), 10) ?? 0,
      pk: getStatValue(statsArr, 'PK'),
      svs: parseInt(getStatValue(statsArr, 'SVS'), 10) ?? 0
    };
  };

  const homeTeam = toTeam(homeComp, 1);
  const awayTeam = toTeam(awayComp, 2);

  /** Extract scorers (goals + assists) from Competitor Composition */
  function getScorers(competitor) {
    const comp = competitor?.Composition;
    const athletes = comp?.Athlete;
    const arr = Array.isArray(athletes) ? athletes : (athletes ? [athletes] : []);
    const scorers = [];
    for (const a of arr) {
      const d = a.Description || {};
      const name = [attr(d, 'GivenName'), attr(d, 'FamilyName')].filter(Boolean).join(' ').trim();
      if (!name) continue;
      const s = a.StatsItems?.StatsItem;
      const sArr = Array.isArray(s) ? s : (s ? [s] : []);
      const gf = parseInt(getStatValue(sArr, 'GF'), 10) ?? 0;
      const ast = parseInt(getStatValue(sArr, 'ASSIST'), 10) ?? 0;
      const pts = parseInt(getStatValue(sArr, 'PTS'), 10) ?? (gf + ast);
      if (gf > 0 || ast > 0) {
        scorers.push({ name, goals: gf, assists: ast, points: pts });
      }
    }
    return scorers.sort((a, b) => b.points - a.points);
  }

  const homeScorers = getScorers(homeComp);
  const awayScorers = getScorers(awayComp);

  /** Compute game time remaining from UnitDateTime and BDFTimestamp */
  const unitDateTime = comp.ExtendedInfos?.UnitDateTime;
  const startDateStr = attr(unitDateTime, 'StartDate');
  const feedTimestampStr = body['@_BDFTimestamp'];
  const periodCode = periodInfo?.['@_Value'] || 'P1';
  let timeRemainingInPeriod = null;
  let timeRemainingGame = null;
  if (startDateStr && feedTimestampStr) {
    const start = new Date(startDateStr);
    const feed = new Date(feedTimestampStr);
    const elapsedSec = Math.max(0, Math.floor((feed - start) / 1000));
    const PERIOD_SEC = 20 * 60;
    const INTERMISSION_SEC = 15 * 60;
    const p1End = PERIOD_SEC;
    const p2Start = p1End + INTERMISSION_SEC;
    const p2End = p2Start + PERIOD_SEC;
    const p3Start = p2End + INTERMISSION_SEC;
    const p3End = p3Start + PERIOD_SEC;
    if (periodCode === 'P1' && elapsedSec < p1End) {
      timeRemainingInPeriod = p1End - elapsedSec;
      timeRemainingGame = timeRemainingInPeriod + 2 * PERIOD_SEC + 2 * INTERMISSION_SEC;
    } else if (periodCode === 'P2' && elapsedSec >= p2Start && elapsedSec < p2End) {
      timeRemainingInPeriod = p2End - elapsedSec;
      timeRemainingGame = timeRemainingInPeriod + PERIOD_SEC + INTERMISSION_SEC;
    } else if (periodCode === 'P3' && elapsedSec >= p3Start && elapsedSec < p3End) {
      timeRemainingInPeriod = p3End - elapsedSec;
      timeRemainingGame = timeRemainingInPeriod;
    } else if (periodCode === 'OT' || elapsedSec >= p3End) {
      timeRemainingInPeriod = null;
      timeRemainingGame = 0;
    }
  }

  return {
    resultStatus: body['@_ResultStatus'] || '',
    date: body['@_Date'] || '',
    timestamp: body['@_BDFTimestamp'] || '',
    version: body['@_Version'] || '',
    period: periodInfo?.['@_Value'] || 'P1',
    discipline: attr(sportDesc, 'DisciplineName') || '',
    eventName: attr(sportDesc, 'EventName') || '',
    subEvent: attr(sportDesc, 'SubEventName') || '',
    unitNum: attr(sportDesc, 'UnitNum') || '',
    venueName: attr(venueDesc, 'VenueName') || attr(venueDesc, 'LocationName') || '',
    homeTeam,
    awayTeam,
    homeScorers,
    awayScorers,
    gameStartDate: startDateStr || null,
    feedTimestamp: feedTimestampStr || null,
    timeRemainingInPeriod: timeRemainingInPeriod != null ? timeRemainingInPeriod : null,
    timeRemainingGame: timeRemainingGame != null ? timeRemainingGame : null,
    periods: periodList.map(p => ({
      code: p['@_Code'] ?? p.Code,
      homeScore: parseInt(attr(p, 'HomePeriodScore'), 10) ?? 0,
      awayScore: parseInt(attr(p, 'AwayPeriodScore'), 10) ?? 0
    }))
  };
}

app.get('/api/iho-live', (req, res) => {
  try {
    const holderPath = resolveIHOHolderPath();
    if (!holderPath) {
      return res.status(503).json({
        error: 'IHO path not found or not accessible',
        details: `Base path: ${IHO_BASE_PATH}`
      });
    }
    const home = req.query.home;
    const away = req.query.away;
    const fileResult = findDTResultFile(holderPath, home, away);
    if (!fileResult) {
      return res.status(404).json({
        error: 'No DT_RESULT file found',
        details: `Searched in: ${holderPath}`
      });
    }
    const { mtime, data } = fileResult;
    data.lastUpdated = mtime.toISOString();
    res.json(data);

    // Sync to Supabase for deployed viewing (non-blocking)
    if (supabase && data.homeTeam?.code && data.awayTeam?.code && data.date) {
      supabase
        .from('iho_game_data')
        .upsert(
          {
            home_team_code: data.homeTeam.code,
            away_team_code: data.awayTeam.code,
            game_date: data.date,
            data,
            last_updated: mtime.toISOString()
          },
          { onConflict: 'home_team_code,away_team_code,game_date' }
        )
        .then(({ error }) => {
          if (error) console.error('IHO Supabase sync error:', error.message);
        });
    }
  } catch (err) {
    console.error('IHO live error:', err);
    const status = err.message?.includes('parse') || err.message?.includes('Invalid') ? 500 : 503;
    res.status(status).json({
      error: 'Failed to load IHO live data',
      details: err.message
    });
  }
});

// ============================================
// Supabase Database Routes (for local development)
// ============================================

// Initialize Supabase client (if env vars are set)
// Check for both correct and common typo in env var name
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
let supabase = null;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
  console.log('✅ Supabase client initialized for database routes');
  console.log(`   URL: ${supabaseUrl.substring(0, 30)}...`);
} else {
  console.log('⚠️  Supabase not configured - database routes will return errors');
  console.log('   Make sure .env file has: SUPABASE_URL and SUPABASE_ANON_KEY');
  console.log('   Current values:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    urlValue: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'missing',
    keyValue: supabaseAnonKey ? '***' + supabaseAnonKey.slice(-4) : 'missing'
  });
}

// Valid resource types
const validResourceTypes = ['commentators', 'producers', 'encoders', 'booths', 'suites', 'networks'];
const validRelationshipTypes = ['commentators', 'booths', 'networks'];

// Generic CRUD handler for resources
async function handleResourceCRUD(tableName, req, res) {
  if (!supabase) {
    return res.status(500).json({ 
      error: 'Database not configured',
      details: 'SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env file'
    });
  }

  try {
    switch (req.method) {
      case 'GET':
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .order('name');
        if (error) throw error;
        res.json(data || []);
        break;

      case 'POST':
        const { name } = req.body;
        if (!name || name.trim() === '') {
          return res.status(400).json({ error: 'Name is required' });
        }
        const { data: newItem, error: insertError } = await supabase
          .from(tableName)
          .insert([{ name: name.trim() }])
          .select()
          .single();
        if (insertError) {
          if (insertError.code === '23505') {
            return res.status(409).json({ error: `${tableName.slice(0, -1)} with this name already exists` });
          }
          throw insertError;
        }
        res.status(201).json(newItem);
        break;

      case 'PUT':
        const { id, name: updatedName } = req.body;
        if (!id) {
          return res.status(400).json({ error: 'ID is required' });
        }
        if (!updatedName || updatedName.trim() === '') {
          return res.status(400).json({ error: 'Name is required' });
        }
        const { data: updated, error: updateError } = await supabase
          .from(tableName)
          .update({ name: updatedName.trim() })
          .eq('id', id)
          .select()
          .single();
        if (updateError) {
          if (updateError.code === '23505') {
            return res.status(409).json({ error: `${tableName.slice(0, -1)} with this name already exists` });
          }
          throw updateError;
        }
        if (!updated) {
          return res.status(404).json({ error: `${tableName.slice(0, -1)} not found` });
        }
        res.json(updated);
        break;

      case 'DELETE':
        const deleteId = req.query.id;
        if (!deleteId) {
          return res.status(400).json({ error: 'ID is required' });
        }
        const { error: deleteError } = await supabase
          .from(tableName)
          .delete()
          .eq('id', deleteId);
        if (deleteError) throw deleteError;
        res.status(204).end();
        break;

      default:
        res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error(`Error in ${tableName} CRUD:`, error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

// Resources endpoint: /api/resources/:type
app.all('/api/resources/:type', async (req, res) => {
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const resourceType = req.params.type;
  
  if (!validResourceTypes.includes(resourceType)) {
    return res.status(400).json({ 
      error: 'Invalid resource type',
      received: resourceType,
      validTypes: validResourceTypes
    });
  }
  
  return handleResourceCRUD(resourceType, req, res);
});

// Blocks CRUD: /api/blocks
app.get('/api/blocks', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    const blockId = req.query.id;
    
    if (blockId) {
      // Get single block with relationships
      const { data: block, error: blockError } = await supabase
        .from('blocks')
        .select(`
          *,
          encoder:encoders(*),
          producer:producers(*),
          suite:suites(*)
        `)
        .eq('id', blockId)
        .single();
      
      if (blockError) throw blockError;
      if (!block) {
        return res.status(404).json({ error: 'Block not found' });
      }

      // Get multiple relationships
      const [commentatorsRes, boothsRes, networksRes] = await Promise.all([
        supabase
          .from('block_commentators')
          .select('*, commentator:commentators(*)')
          .eq('block_id', blockId),
        supabase
          .from('block_booths')
          .select('*, booth:booths(*), network:networks(*)')
          .eq('block_id', blockId),
        supabase
          .from('block_networks')
          .select('*, network:networks(*)')
          .eq('block_id', blockId)
      ]);

      // Check for errors in relationship queries
      if (commentatorsRes.error) {
        console.error(`Error fetching commentators for block ${blockId}:`, commentatorsRes.error);
      }
      if (boothsRes.error) {
        console.error(`Error fetching booths for block ${blockId}:`, boothsRes.error);
      }
      if (networksRes.error) {
        console.error(`Error fetching networks for block ${blockId}:`, networksRes.error);
      }

      const blockData = {
        ...block,
        commentators: (commentatorsRes.data || []).map(c => {
          if (!c.commentator) {
            console.warn(`Missing commentator data for block ${blockId}:`, c);
            return null;
          }
          return {
            id: c.commentator.id,
            name: c.commentator.name,
            role: c.role
          };
        }).filter(Boolean) || [],
        booths: (boothsRes.data || []).map(b => {
          if (!b || !b.booth) {
            console.warn(`Missing booth data for block ${blockId}:`, b);
            return null;
          }
          return {
            id: b.booth.id,
            name: b.booth.name,
            network_id: b.network_id,
            network: (b.network && b.network.id) ? {
              id: b.network.id,
              name: b.network.name
            } : null
          };
        }).filter(Boolean) || [],
        networks: (networksRes.data || []).map(n => {
          if (!n || !n.network || !n.network.id) {
            console.warn(`Missing network data for block ${blockId}:`, n);
            return null;
          }
          return {
            id: n.network.id,
            name: n.network.name
          };
        }).filter(Boolean) || []
      };

      res.json(blockData);
    } else {
      // Get all blocks with relationships, optionally filtered by date
      const dateFilter = req.query.date; // Optional YYYY-MM-DD date filter

      let blocksQuery = supabase
        .from('blocks')
        .select(`
          *,
          encoder:encoders(*),
          producer:producers(*),
          suite:suites(*)
        `)
        .order('start_time');

      // If date filter provided, only return blocks within ±2 days (covers timezone offsets and 48h zoom)
      if (dateFilter) {
        const filterDate = new Date(dateFilter + 'T00:00:00Z');
        const fromDate = new Date(filterDate);
        fromDate.setDate(fromDate.getDate() - 2);
        const toDate = new Date(filterDate);
        toDate.setDate(toDate.getDate() + 3); // +3 to cover full end-of-day
        blocksQuery = blocksQuery
          .gte('start_time', fromDate.toISOString())
          .lte('start_time', toDate.toISOString());
      }

      const { data: blocks, error: blocksError } = await blocksQuery;
      
      if (blocksError) {
        console.error('Blocks query error:', blocksError);
        throw blocksError;
      }

      const blockIds = (blocks || []).map(b => b.id);

      // Bulk-load all associations in 3 queries (instead of 3 per block)
      let allCommentators = [], allBooths = [], allNetworks = [];
      if (blockIds.length > 0) {
        const [commentatorsRes, boothsRes, networksRes] = await Promise.all([
          supabase
            .from('block_commentators')
            .select('*, commentator:commentators(*)')
            .in('block_id', blockIds),
          supabase
            .from('block_booths')
            .select('*, booth:booths(*), network:networks(*)')
            .in('block_id', blockIds),
          supabase
            .from('block_networks')
            .select('*, network:networks(*)')
            .in('block_id', blockIds)
        ]);

        if (commentatorsRes.error) console.error('Bulk commentators query error:', commentatorsRes.error);
        if (boothsRes.error) console.error('Bulk booths query error:', boothsRes.error);
        if (networksRes.error) console.error('Bulk networks query error:', networksRes.error);

        allCommentators = commentatorsRes?.data || [];
        allBooths = boothsRes?.data || [];
        allNetworks = networksRes?.data || [];
      }

      // Group associations by block_id
      const commentatorsByBlock = {};
      allCommentators.forEach(c => {
        if (!commentatorsByBlock[c.block_id]) commentatorsByBlock[c.block_id] = [];
        commentatorsByBlock[c.block_id].push(c);
      });
      const boothsByBlock = {};
      allBooths.forEach(b => {
        if (!boothsByBlock[b.block_id]) boothsByBlock[b.block_id] = [];
        boothsByBlock[b.block_id].push(b);
      });
      const networksByBlock = {};
      allNetworks.forEach(n => {
        if (!networksByBlock[n.block_id]) networksByBlock[n.block_id] = [];
        networksByBlock[n.block_id].push(n);
      });

      // Map associations onto blocks
      const blocksWithRelations = (blocks || []).map(block => ({
        ...block,
        commentators: (commentatorsByBlock[block.id] || [])
          .filter(c => c && c.commentator)
          .map(c => ({
            id: c.commentator.id,
            name: c.commentator.name,
            role: c.role
          })),
        booths: (boothsByBlock[block.id] || [])
          .filter(b => b && b.booth)
          .map(b => ({
            id: b.booth.id,
            name: b.booth.name,
            network_id: b.network_id,
            network: b.network && b.network.id ? {
              id: b.network.id,
              name: b.network.name
            } : null
          })),
        networks: (networksByBlock[block.id] || [])
          .filter(n => n && n.network && n.network.id)
          .map(n => ({
            id: n.network.id,
            name: n.network.name
          }))
      }));

      console.log(`Loaded ${blocksWithRelations.length} blocks with associations in 4 queries${dateFilter ? ` (filtered by ${dateFilter})` : ''}`);
      res.json(blocksWithRelations);
    }
  } catch (error) {
    console.error('Error in /api/blocks:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      code: error.code,
      details: error.details,
      hint: error.hint,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

app.post('/api/blocks', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    const { 
      name, block_id, obs_id, start_time, end_time, duration,
      broadcast_start_time, broadcast_end_time,
      encoder_id, producer_id, suite_id, source_event_id, obs_group, type, canadian_content
    } = req.body;

    if (!name || !start_time || !end_time) {
      return res.status(400).json({ error: 'Name, start_time, and end_time are required' });
    }

    let calculatedDuration = duration;
    if (!calculatedDuration && start_time && end_time) {
      const start = new Date(start_time);
      const end = new Date(end_time);
      const diffMs = end - start;
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      calculatedDuration = `${hours}:${minutes}:${seconds}`;
    }

    const { data: newBlock, error: insertError } = await supabase
      .from('blocks')
      .insert([{
        name: name.trim(),
        block_id: block_id?.trim() || null,
        obs_id: obs_id?.trim() || null,
        start_time,
        end_time,
        duration: calculatedDuration,
        broadcast_start_time: broadcast_start_time || null,
        broadcast_end_time: broadcast_end_time || null,
        encoder_id: encoder_id || null,
        producer_id: producer_id || null,
        suite_id: suite_id || null,
        source_event_id: source_event_id || null,
        obs_group: obs_group?.trim() || null,
        type: type && type.trim() ? type.trim() : null,
        canadian_content: canadian_content === true || canadian_content === 'true'
      }])
      .select()
      .single();
    
    if (insertError) {
      console.error('Supabase insert error:', insertError);
      throw insertError;
    }
    res.status(201).json(newBlock);
  } catch (error) {
    console.error('Error creating block:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      code: error.code,
      details: error.details,
      hint: error.hint
    });
  }
});

app.put('/api/blocks', async (req, res) => {
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    const { 
      id, name, block_id, obs_id, start_time, end_time, duration,
      broadcast_start_time, broadcast_end_time,
      encoder_id, producer_id, suite_id, source_event_id, obs_group, type, canadian_content
    } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }

    let calcDuration = duration;
    if (!calcDuration && start_time && end_time) {
      const start = new Date(start_time);
      const end = new Date(end_time);
      const diffMs = end - start;
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      calcDuration = `${hours}:${minutes}:${seconds}`;
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (block_id !== undefined) updateData.block_id = block_id?.trim() || null;
    if (obs_id !== undefined) updateData.obs_id = obs_id?.trim() || null;
    if (start_time !== undefined) updateData.start_time = start_time;
    if (end_time !== undefined) updateData.end_time = end_time;
    if (broadcast_start_time !== undefined) updateData.broadcast_start_time = broadcast_start_time || null;
    if (broadcast_end_time !== undefined) updateData.broadcast_end_time = broadcast_end_time || null;
    if (calcDuration !== undefined) updateData.duration = calcDuration;
    if (encoder_id !== undefined) updateData.encoder_id = encoder_id || null;
    if (producer_id !== undefined) updateData.producer_id = producer_id || null;
    if (suite_id !== undefined) updateData.suite_id = suite_id || null;
    if (source_event_id !== undefined) updateData.source_event_id = source_event_id || null;
    if (obs_group !== undefined) updateData.obs_group = obs_group?.trim() || null;
    if (type !== undefined) updateData.type = type?.trim() || null;
    if (canadian_content !== undefined) updateData.canadian_content = canadian_content === true || canadian_content === 'true';

    const { data: updated, error: updateError } = await supabase
      .from('blocks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (updateError) throw updateError;
    if (!updated) {
      return res.status(404).json({ error: 'Block not found' });
    }
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating block:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.delete('/api/blocks', async (req, res) => {
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    const deleteId = req.query.id;
    if (!deleteId) {
      return res.status(400).json({ error: 'ID is required' });
    }

    const { error: deleteError } = await supabase
      .from('blocks')
      .delete()
      .eq('id', deleteId);
    
    if (deleteError) throw deleteError;
    res.status(204).end();
  } catch (error) {
    console.error('Error deleting block:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Planning: On Air row + producer broadcast times and notes (stored in DB)
// Fallback to file when Supabase is not configured
const planningPath = path.join(dataDir, 'planning.json');
function readPlanningFile() {
  try {
    const raw = fs.readFileSync(planningPath, 'utf8');
    const data = JSON.parse(raw);
    return {
      onAirBlockIds: Array.isArray(data.onAirBlockIds) ? data.onAirBlockIds : [],
      overrides: data.overrides && typeof data.overrides === 'object' ? data.overrides : {}
    };
  } catch (e) {
    if (e.code === 'ENOENT') return { onAirBlockIds: [], overrides: {} };
    throw e;
  }
}
function writePlanningFile(data) {
  fs.writeFileSync(planningPath, JSON.stringify(data, null, 2), 'utf8');
}

app.get('/api/planning', async (req, res) => {
  try {
    if (supabase) {
      const { data: rows, error } = await supabase
        .from('planning')
        .select('block_id, producer_broadcast_start_time, producer_broadcast_end_time, notes, sort_order')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      const onAirBlockIds = (rows || []).map(r => r.block_id);
      const overrides = (rows || []).reduce((acc, r) => {
        acc[r.block_id] = {
          producer_broadcast_start_time: r.producer_broadcast_start_time || undefined,
          producer_broadcast_end_time: r.producer_broadcast_end_time || undefined,
          notes: r.notes || undefined
        };
        return acc;
      }, {});
      return res.json({ onAirBlockIds, overrides });
    }
    const data = readPlanningFile();
    res.json(data);
  } catch (error) {
    console.error('Error reading planning:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.put('/api/planning', async (req, res) => {
  try {
    const { onAirBlockIds, overrides } = req.body || {};
    const ids = Array.isArray(onAirBlockIds) ? onAirBlockIds : [];
    const overridesObj = overrides && typeof overrides === 'object' ? overrides : {};

    if (supabase) {
      const { error: deleteError } = await supabase.from('planning').delete().neq('block_id', '00000000-0000-0000-0000-000000000000');
      if (deleteError) throw deleteError;
      if (ids.length > 0) {
        const insertRows = ids.map((block_id, i) => {
          const o = overridesObj[block_id] || {};
          return {
            block_id,
            producer_broadcast_start_time: o.producer_broadcast_start_time || null,
            producer_broadcast_end_time: o.producer_broadcast_end_time || null,
            notes: o.notes || null,
            sort_order: i
          };
        });
        const { error: insertError } = await supabase.from('planning').upsert(insertRows, { onConflict: 'block_id' });
        if (insertError) throw insertError;
      }
      const { data: rows, error: selectError } = await supabase
        .from('planning')
        .select('block_id, producer_broadcast_start_time, producer_broadcast_end_time, notes, sort_order')
        .order('sort_order', { ascending: true });
      if (selectError) throw selectError;
      const nextIds = (rows || []).map(r => r.block_id);
      const nextOverrides = (rows || []).reduce((acc, r) => {
        acc[r.block_id] = {
          producer_broadcast_start_time: r.producer_broadcast_start_time || undefined,
          producer_broadcast_end_time: r.producer_broadcast_end_time || undefined,
          notes: r.notes || undefined
        };
        return acc;
      }, {});
      return res.json({ onAirBlockIds: nextIds, overrides: nextOverrides });
    }

    const current = readPlanningFile();
    const next = {
      onAirBlockIds: ids.length > 0 ? ids : current.onAirBlockIds,
      overrides: Object.keys(overridesObj).length > 0 ? overridesObj : current.overrides
    };
    writePlanningFile(next);
    res.json(next);
  } catch (error) {
    console.error('Error writing planning:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Block relationships: /api/blocks/:blockId/relationships
app.all('/api/blocks/:blockId/relationships', async (req, res) => {
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const blockId = req.params.blockId;
  let relationshipType = req.query.relationshipType;
  
  if (!relationshipType && req.url) {
    const match = req.url.match(/\/relationships\?relationshipType=([^&]+)/);
    if (match) relationshipType = match[1];
  }

  if (!blockId) {
    return res.status(400).json({ error: 'Block ID is required' });
  }

  if (!relationshipType) {
    return res.status(400).json({ error: 'Relationship type is required' });
  }

  if (!validRelationshipTypes.includes(relationshipType)) {
    return res.status(400).json({ 
      error: 'Invalid relationship type',
      received: relationshipType,
      validTypes: validRelationshipTypes
    });
  }

  const tableName = `block_${relationshipType}`;
  const foreignKey = relationshipType === 'commentators' 
    ? 'commentator_id' 
    : relationshipType === 'booths'
    ? 'booth_id'
    : 'network_id';
  const relatedTable = relationshipType;
  const relatedKey = relationshipType.slice(0, -1); // commentators -> commentator

  try {
    switch (req.method) {
      case 'GET':
        // For booths, also include network relationship if network_id exists
        const selectFields = relationshipType === 'booths'
          ? `*, ${relatedKey}:${relatedTable}(*), network:networks(*)`
          : `*, ${relatedKey}:${relatedTable}(*)`;
        
        const { data, error } = await supabase
          .from(tableName)
          .select(selectFields)
          .eq('block_id', blockId)
          .order('created_at');
        if (error) throw error;
        res.json(data || []);
        break;

      case 'POST':
        const relationshipId = req.body[foreignKey];
        const role = req.body.role;
        const networkId = req.body.network_id; // For booths, we need to know which network
        
        if (!relationshipId) {
          return res.status(400).json({ error: `${foreignKey} is required` });
        }

        // For booths: require network_id to associate booth with a specific network
        if (relationshipType === 'booths' && !networkId) {
          return res.status(400).json({ error: 'network_id is required when adding a booth relationship' });
        }

        const insertData = {
          block_id: blockId,
          [foreignKey]: relationshipId
        };
        
        if (relationshipType === 'commentators' && role) {
          insertData.role = role;
        }
        
        // For booths, include network_id to allow same booth for different networks
        if (relationshipType === 'booths' && networkId) {
          insertData.network_id = networkId;
        }

        // For booths, also include network in the select
        const selectFieldsForInsert = relationshipType === 'booths'
          ? `*, ${relatedKey}:${relatedTable}(*), network:networks(*)`
          : `*, ${relatedKey}:${relatedTable}(*)`;
        
        const { data: link, error: linkError } = await supabase
          .from(tableName)
          .insert([insertData])
          .select(selectFieldsForInsert)
          .single();
        
        if (linkError) {
          console.error('Supabase insert error:', {
            code: linkError.code,
            message: linkError.message,
            details: linkError.details,
            hint: linkError.hint,
            relationshipType,
            insertData
          });
          
          if (linkError.code === '23505') {
            // Duplicate key error - relationship already exists
            // For booths with network_id, check if this exact combination exists
            if (relationshipType === 'booths' && networkId) {
              // For booths, also include network in the select
              const selectFieldsForExisting = relationshipType === 'booths'
                ? `*, ${relatedKey}:${relatedTable}(*), network:networks(*)`
                : `*, ${relatedKey}:${relatedTable}(*)`;
              
              try {
                const { data: existingLink, error: fetchError } = await supabase
                  .from(tableName)
                  .select(selectFieldsForExisting)
                  .eq('block_id', blockId)
                  .eq(foreignKey, relationshipId)
                  .eq('network_id', networkId)
                  .single();
                
                if (existingLink && !fetchError) {
                  return res.status(200).json(existingLink);
                }
                // If fetchError, log it but continue to return 409
                if (fetchError) {
                  console.log('Error fetching existing booth relationship:', fetchError);
                }
              } catch (fetchErr) {
                // Continue to return 409
              }
            } else {
              // For non-booth relationships (networks, commentators), try to fetch existing
              const selectFieldsForExisting = relationshipType === 'booths'
                ? `*, ${relatedKey}:${relatedTable}(*), network:networks(*)`
                : `*, ${relatedKey}:${relatedTable}(*)`;
              
              const { data: existingLink, error: fetchError } = await supabase
                .from(tableName)
                .select(selectFieldsForExisting)
                .eq('block_id', blockId)
                .eq(foreignKey, relationshipId)
                .single();
              
              if (existingLink && !fetchError) {
                return res.status(200).json(existingLink);
              }
            }
            return res.status(409).json({ error: `${relatedKey} is already linked to this block${relationshipType === 'booths' ? ' for this network' : ''}` });
          }
          console.error('Error adding relationship:', linkError);
          return res.status(500).json({ error: linkError.message || 'Failed to add relationship' });
        }
        res.status(201).json(link);
        break;

      case 'DELETE':
        const linkId = req.query.linkId;
        if (!linkId) {
          return res.status(400).json({ error: 'Link ID is required' });
        }

        const { error: deleteError } = await supabase
          .from(tableName)
          .delete()
          .eq('id', linkId)
          .eq('block_id', blockId);
        
        if (deleteError) {
          console.error('Error deleting relationship:', deleteError);
          return res.status(500).json({ error: deleteError.message || 'Failed to delete relationship' });
        }
        res.status(204).end();
        break;

      default:
        res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error(`Error in block ${relationshipType}:`, error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Booth blocks: /api/booths/:boothId/blocks
app.get('/api/booths/:boothId/blocks', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    const boothId = req.params.boothId;

    const { data: blockBooths, error: blockBoothsError } = await supabase
      .from('block_booths')
      .select('block_id')
      .eq('booth_id', boothId);
    
    if (blockBoothsError) throw blockBoothsError;

    if (!blockBooths || blockBooths.length === 0) {
      return res.json([]);
    }

    const blockIds = blockBooths.map(bb => bb.block_id);

    const { data: blocks, error: blocksError } = await supabase
      .from('blocks')
      .select(`
        *,
        encoder:encoders(*),
        producer:producers(*),
        suite:suites(*)
      `)
      .in('id', blockIds)
      .order('start_time');
    
    if (blocksError) throw blocksError;

    const blocksWithRelations = await Promise.all(
      (blocks || []).map(async (block) => {
        const [commentatorsRes, boothsRes, networksRes] = await Promise.all([
          supabase
            .from('block_commentators')
            .select('*, commentator:commentators(*)')
            .eq('block_id', block.id),
          supabase
            .from('block_booths')
            .select('*, booth:booths(*)')
            .eq('block_id', block.id),
          supabase
            .from('block_networks')
            .select('*, network:networks(*)')
            .eq('block_id', block.id)
        ]);

        return {
          ...block,
          commentators: commentatorsRes.data?.map(c => ({
            id: c.commentator.id,
            name: c.commentator.name,
            role: c.role
          })) || [],
          booths: boothsRes.data?.map(b => ({
            id: b.booth.id,
            name: b.booth.name
          })) || [],
          networks: networksRes.data?.map(n => ({
            id: n.network.id,
            name: n.network.name
          })) || []
        };
      })
    );

    res.json(blocksWithRelations);
  } catch (error) {
    console.error('Error in booth blocks:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Auto-load CSV file from data directory on startup
function loadStaticCSVOnStartup() {
  try {
    if (!fs.existsSync(dataDir)) {
      console.log(`Data directory does not exist: ${dataDir}`);
      return;
    }
    
    const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.csv'));
    if (files.length > 0) {
      const filename = files[0];
      const filePath = path.join(dataDir, filename);
      console.log(`Auto-loading CSV file: ${filename}`);
      
      if (!fs.existsSync(filePath)) {
        console.error(`CSV file not found: ${filePath}`);
        return;
      }
      
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      
      if (!fileContent || fileContent.trim().length === 0) {
        console.error(`CSV file is empty: ${filename}`);
        return;
      }
      
      const result = processCSVContent(fileContent);
      eventsData = result.events;
      
      // Save to events.json
      const eventsJsonPath = path.join(__dirname, 'events.json');
      fs.writeFileSync(eventsJsonPath, JSON.stringify(eventsData, null, 2));
      
      console.log(`Loaded ${result.events.length} events from ${filename}`);
    } else {
      console.log(`No CSV file found in data directory: ${dataDir}`);
      console.log(`Place a CSV file here to auto-load on startup`);
    }
  } catch (error) {
    console.error('Error auto-loading CSV:', error.message);
    console.error('Error stack:', error.stack);
  }
}

// Global error handler (must be after all routes)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  console.error('Error stack:', err.stack);
  res.status(500).json({ 
    error: 'Internal server error', 
    details: err.message,
    path: req.path
  });
});

// Register all routes before starting server
console.log('Registering routes...');
console.log('Routes registered. Starting server...');

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Available routes:');
  console.log('  GET  /api/health');
  console.log('  GET  /api/iho-live');
  console.log('  GET  /api/events');
  console.log('  GET  /api/events/dates');
  console.log('  POST /api/upload');
  console.log('  POST /api/load-static');
  if (supabase) {
    console.log('  Database routes (Supabase):');
    console.log('    GET/POST/PUT/DELETE /api/resources/:type');
  console.log('    GET/POST/PUT/DELETE /api/blocks');
  console.log('    GET/PUT /api/planning');
  console.log('    GET/POST/DELETE /api/blocks/:blockId/relationships');
  console.log('    GET /api/booths/:boothId/blocks');
  }
  loadStaticCSVOnStartup();
});
