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
import nodeFetch from 'node-fetch';
import https from 'https';

// Semaphore limits concurrent Supabase HTTP requests (max 3) to prevent
// ECONNRESET / TLS failures from too many parallel connections on Node 18.
const SB_MAX_CONCURRENT = 3;
let _sbInFlight = 0;
const _sbWaiters = [];
function _sbAcquire() {
  if (_sbInFlight < SB_MAX_CONCURRENT) { _sbInFlight++; return Promise.resolve(); }
  return new Promise(resolve => _sbWaiters.push(resolve));
}
function _sbRelease() {
  if (_sbWaiters.length > 0) { _sbWaiters.shift()(); }
  else { _sbInFlight--; }
}
async function queuedFetch(url, opts = {}) {
  await _sbAcquire();
  try {
    return await nodeFetch(url, { ...opts, agent: new https.Agent({ family: 4 }), timeout: 30000 });
  } finally {
    _sbRelease();
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env: backend first (explicit path), then project root
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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

/** Normalize parsed JSON to events array: accept raw array or { events: [...] }. */
function normalizeEventsArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.events)) return parsed.events;
  return [];
}

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
            eventsData = normalizeEventsArray(JSON.parse(fileContent));
          }
        } catch (error) {
          console.error('Error reading events.json:', error);
          eventsData = [];
        }
      }
    }
    const safeEvents = Array.isArray(eventsData) ? eventsData : [];

    // Filter by date if provided
    let filteredEvents = safeEvents;
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
            eventsData = normalizeEventsArray(JSON.parse(fileContent));
          }
        } catch (error) {
          console.error('Error reading events.json:', error);
          eventsData = [];
        }
      }
    }
    const safeEvents = Array.isArray(eventsData) ? eventsData : [];

    // Extract unique dates from events
    const dates = new Set();
    safeEvents.forEach(event => {
      const eventDate = new Date(event.start_time);
      eventDate.setUTCHours(0, 0, 0, 0);
      dates.add(eventDate.toISOString().split('T')[0]);
    });
    
    const sortedDates = Array.from(dates).sort();
    res.json(sortedDates);
  } catch (err) {
    console.error('Error in /api/events/dates:', err);
    res.status(500).json({ error: 'Error fetching dates', details: err.message });
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

// ============================================
// CUR DT_RESULT Live Feed (Curling)
// ============================================
const CUR_BASE_PATH = process.env.CUR_BASE_PATH || 'M:\\Incoming\\CUR';

// ============================================
// LUG DT_RESULT Live Feed (Luge)
// ============================================
const LUG_BASE_PATH = process.env.LUG_BASE_PATH || 'M:\\Incoming\\LUG';

// ============================================
// SSK DT_RESULT Live Feed (Speed Skating)
// ============================================
const SSK_BASE_PATH = process.env.SSK_BASE_PATH || 'M:\\Incoming\\SSK';

// ============================================
// STK DT_RESULT Live Feed (Short Track Speed Skating)
// ============================================
const STK_BASE_PATH = process.env.STK_BASE_PATH || 'M:\\Incoming\\STK';

// ============================================
// SBD DT_RESULT Live Feed (Snowboard – scored events)
// ============================================
const SBD_BASE_PATH = process.env.SBD_BASE_PATH || 'M:\\Incoming\\SBD';

// ============================================
// ODF Schedule Merge (updates CSV events from M: XML)
// ============================================
const INCOMING_BASE = process.env.INCOMING_BASE || 'M:\\Incoming';
const ODDF_SCHEDULE_FOLDERS = ['OBS', 'GEN', 'SBD', 'IHO', 'CUR', 'SSK', 'STK', 'LUG', 'SKE', 'BOB', 'NOC'];
const ODF_SCHEDULE_MERGE_ENABLED = process.env.ODF_SCHEDULE_MERGE_ENABLED !== 'false';
const ODF_SCHEDULE_MERGE_INTERVAL_MS = Math.max(60 * 60 * 1000, parseInt(process.env.ODF_SCHEDULE_MERGE_INTERVAL_MIN || '60', 10) * 60 * 1000);
const ODF_SCHEDULE_FIRST_RUN_DELAY_MS = 2 * 60 * 1000; // 2 min after startup
const ODF_MAX_FILES_PER_FOLDER = 5;

/**
 * Resolve up to N holder folder paths (newest first). Searches recent hour folders.
 * If current hour has no results, searches previous hour. Returns [] if none found.
 */
function resolveHolderPaths(basePath, maxFolders = 2) {
  if (!fs.existsSync(basePath)) return [];
  const dateDirs = fs.readdirSync(basePath, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
    .sort((a, b) => b.name.localeCompare(a.name));
  if (dateDirs.length === 0) return [];
  const datePath = path.join(basePath, dateDirs[0].name);
  const holderDirs = fs.readdirSync(datePath, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d+$/.test(d.name))
    .sort((a, b) => parseInt(b.name, 10) - parseInt(a.name, 10));
  return holderDirs.slice(0, maxFolders).map(d => path.join(datePath, d.name));
}

/** Resolve holder paths for a specific date (all hour folders for that date). */
function resolveHolderPathsForDate(basePath, date, maxFolders = 24) {
  const datePath = path.join(basePath, date);
  if (!fs.existsSync(datePath)) return [];
  const holderDirs = fs.readdirSync(datePath, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d+$/.test(d.name))
    .sort((a, b) => parseInt(b.name, 10) - parseInt(a.name, 10));
  return holderDirs.slice(0, maxFolders).map(d => path.join(datePath, d.name));
}

/** Resolve newest hour folder from each of the N most recent dates (for pool/bracket lookback). */
function resolveRecentDatePaths(basePath, numDates = 5) {
  if (!fs.existsSync(basePath)) return [];
  const dateDirs = fs.readdirSync(basePath, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
    .sort((a, b) => b.name.localeCompare(a.name));
  const result = [];
  for (const dd of dateDirs.slice(0, numDates)) {
    const datePath = path.join(basePath, dd.name);
    const holderDirs = fs.readdirSync(datePath, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^\d+$/.test(d.name))
      .sort((a, b) => parseInt(b.name, 10) - parseInt(a.name, 10));
    if (holderDirs.length > 0) {
      result.push(path.join(datePath, holderDirs[0].name));
    }
  }
  return result;
}

/** Resolve IHO holder paths (up to 2 folders, newest first). */
function resolveIHOHolderPaths() {
  return resolveHolderPaths(IHO_BASE_PATH, 2);
}

/** Wider IHO holder paths for PBP scanning (up to 5 hours to cover full game). */
function resolveIHOHolderPathsWide() {
  return resolveHolderPaths(IHO_BASE_PATH, 5);
}

/** Resolve CUR holder paths (up to 2 folders, newest first). */
function resolveCURHolderPaths() {
  return resolveHolderPaths(CUR_BASE_PATH, 2);
}

/** Resolve LUG holder paths (up to 4 hour folders, newest first). */
function resolveLUGHolderPaths() {
  return resolveHolderPaths(LUG_BASE_PATH, 4);
}

/** Resolve SSK holder paths (up to 4 hour folders, newest first, single latest date). */
function resolveSSKHolderPaths() {
  return resolveHolderPaths(SSK_BASE_PATH, 4);
}

/** Resolve STK holder paths (up to 4 hour folders, newest first, single latest date). */
function resolveSTKHolderPaths() {
  return resolveHolderPaths(STK_BASE_PATH, 4);
}

/** Resolve SBD holder paths (up to 10 hour folders, newest first, single latest date).
 *  SBD events (halfpipe, SBX) can span many hours; need wider lookback. */
function resolveSBDHolderPaths() {
  return resolveHolderPaths(SBD_BASE_PATH, 10);
}

/** True if req has source=db or archived=1 (skip file scan, use DB only). */
function wantsDbOnly(req) {
  const s = (req.query.source || '').toLowerCase();
  const a = (req.query.archived || '').toString();
  return s === 'db' || a === '1' || a === 'true';
}

/** Fast check: does dir contain any filename including DT_RESULT_? (readdir only, no stat/read). */
function hasAnyDTResultInDir(dirPath) {
  if (!fs.existsSync(dirPath)) return false;
  try {
    const names = fs.readdirSync(dirPath);
    return names.some(n => n.includes('DT_RESULT_'));
  } catch (_) {
    return false;
  }
}

/** Fast check: does dir contain any Luge result filename? Cumulative or relay DT_RESULT. */
function hasAnyLugeResultInDir(dirPath) {
  if (!fs.existsSync(dirPath)) return false;
  try {
    const names = fs.readdirSync(dirPath);
    return names.some(n => n.includes('DT_CUMULATIVE_RESULT_') || (n.includes('DT_RESULT_') && /RELAY/i.test(n)));
  } catch (_) {
    return false;
  }
}

/** Fast check: do any holder paths have Luge result files? */
function hasAnyLugeFiles() {
  const paths = resolveLUGHolderPaths();
  return paths.length > 0 && paths.some(p => hasAnyLugeResultInDir(p));
}

/** Fast check: does dir contain any SSK DT_RESULT filename? (readdir only). */
function hasAnySSKResultInDir(dirPath) {
  if (!fs.existsSync(dirPath)) return false;
  try {
    const names = fs.readdirSync(dirPath);
    return names.some(n => n.includes('DT_RESULT'));
  } catch (_) {
    return false;
  }
}

/** Fast check: do any holder paths have SSK result files? */
function hasAnySSKFiles() {
  const paths = resolveSSKHolderPaths();
  return paths.length > 0 && paths.some(p => hasAnySSKResultInDir(p));
}

/** Fast check: does dir contain any STK DT_RESULT filename? (readdir only). */
function hasAnySTKResultInDir(dirPath) {
  if (!fs.existsSync(dirPath)) return false;
  try {
    const names = fs.readdirSync(dirPath);
    return names.some(n => n.includes('DT_RESULT'));
  } catch (_) {
    return false;
  }
}

/** Fast check: do any holder paths have STK result files? */
function hasAnySTKFiles() {
  const paths = resolveSTKHolderPaths();
  return paths.length > 0 && paths.some(p => hasAnySTKResultInDir(p));
}

/** Fast check: does dir contain any SBD DT_RESULT filename? */
function hasAnySBDResultInDir(dirPath) {
  if (!fs.existsSync(dirPath)) return false;
  try {
    const names = fs.readdirSync(dirPath);
    return names.some(n => n.includes('DT_RESULT') || n.includes('DT_PHASE_RESULT'));
  } catch (_) {
    return false;
  }
}

/** Fast check: do any holder paths have SBD result files? */
function hasAnySBDFiles() {
  const paths = resolveSBDHolderPaths();
  return paths.length > 0 && paths.some(p => hasAnySBDResultInDir(p));
}

/** @deprecated Use resolveIHOHolderPaths */
function resolveIHOHolderPath() {
  const paths = resolveIHOHolderPaths();
  return paths.length > 0 ? paths[0] : null;
}

/** @deprecated Use resolveCURHolderPaths */
function resolveCURHolderPath() {
  const paths = resolveCURHolderPaths();
  return paths.length > 0 ? paths[0] : null;
}

/**
 * List all DT_RESULT_* files in folder, sorted by filename newest first.
 * Filenames embed timestamps (e.g. 20260212215958492_...) so sorting by name
 * gives newest first without expensive stat calls on slow network drives.
 * Returns array of { name, path, mtime }. mtime is lazy-loaded on first access.
 */
function listDTResultFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(f => f.includes('DT_RESULT_'))
    .sort((a, b) => b.localeCompare(a)) // filename = timestamp prefix, so desc = newest
    .map(f => {
      const filePath = path.join(dirPath, f);
      return {
        name: f,
        path: filePath,
        get mtime() {
          // Lazy stat: only called when mtime is actually accessed
          try { return fs.statSync(filePath).mtime; }
          catch { return new Date(); }
        }
      };
    });
}

/**
 * List SSK result files: DT_RESULT_* (finals, semi-finals, etc). FNL in DocumentCode = final.
 */
function listSSKResultFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(f => f.includes('DT_RESULT'))
    .map(f => {
      const filePath = path.join(dirPath, f);
      let stat;
      try { stat = fs.statSync(filePath); } catch (_) { return null; }
      if (!stat.isFile()) return null;
      return { name: f, path: filePath, mtime: stat.mtime };
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
}

/**
 * List STK result files: DT_RESULT_* (quarterfinals, semi-finals, finals).
 */
function listSTKResultFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(f => f.includes('DT_RESULT'))
    .map(f => {
      const filePath = path.join(dirPath, f);
      let stat;
      try { stat = fs.statSync(filePath); } catch (_) { return null; }
      if (!stat.isFile()) return null;
      return { name: f, path: filePath, mtime: stat.mtime };
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
}

/**
 * List SBD result files: DT_RESULT (per-run results) and DT_PHASE_RESULT (overall standings).
 */
function listSBDResultFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const allFiles = fs.readdirSync(dirPath)
    .filter(f => f.includes('DT_RESULT') || f.includes('DT_PHASE_RESULT'))
    .sort((a, b) => b.localeCompare(a)); // filename = timestamp prefix → desc = newest
  // Deduplicate: keep only newest file per unique event pattern (e.g. SBDWSBX...QFNL000100)
  const seen = new Set();
  const deduped = [];
  for (const f of allFiles) {
    const m = f.match(/DT_(?:PHASE_)?RESULT_(SBD.+?)__/);
    const key = m ? m[1] : f;
    if (!seen.has(key)) {
      seen.add(key);
      const filePath = path.join(dirPath, f);
      deduped.push({
        name: f,
        path: filePath,
        get mtime() {
          try { return fs.statSync(filePath).mtime; } catch (_) { return new Date(0); }
        }
      });
    }
  }
  return deduped;
}

/**
 * List SBD schedule update files.
 */
function listSBDScheduleFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(f => f.includes('DT_SCHEDULE_UPDATE'))
    .sort((a, b) => b.localeCompare(a)) // filename = timestamp prefix → desc = newest
    .map(f => {
      const filePath = path.join(dirPath, f);
      return {
        name: f,
        path: filePath,
        get mtime() {
          try { return fs.statSync(filePath).mtime; } catch (_) { return new Date(0); }
        }
      };
    });
}

/**
 * List DT_SCHEDULE* XML files in a directory (for ODF schedule merge).
 * Returns up to maxFiles newest by mtime.
 */
function listOdfScheduleFiles(dirPath, maxFiles = ODF_MAX_FILES_PER_FOLDER) {
  if (!fs.existsSync(dirPath)) return [];
  const files = [];
  try {
    for (const name of fs.readdirSync(dirPath)) {
      if (!name.includes('DT_SCHEDULE') || (!name.endsWith('.xml') && !name.includes('_'))) continue;
      const filePath = path.join(dirPath, name);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) files.push({ name, path: filePath, mtime: stat.mtime });
      } catch (_) { /* skip */ }
    }
  } catch (_) { return []; }
  return files
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, maxFiles);
}

/**
 * Resolve holder paths for ODF schedule scan.
 * For each sport folder: newest 3 dates → ALL hour folders (schedule updates arrive at any hour,
 * and older dates may contain data not repeated in newer updates).
 */
function resolveOdfScheduleHolderPaths() {
  const paths = [];
  if (!fs.existsSync(INCOMING_BASE)) return paths;
  for (const sport of ODDF_SCHEDULE_FOLDERS) {
    const sportPath = path.join(INCOMING_BASE, sport);
    if (!fs.existsSync(sportPath)) continue;
    try {
      const dateDirs = fs.readdirSync(sportPath, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
        .sort((a, b) => b.name.localeCompare(a.name));
      if (dateDirs.length === 0) continue;
      for (const dd of dateDirs.slice(0, 3)) {
        const datePath = path.join(sportPath, dd.name);
        const hourDirs = fs.readdirSync(datePath, { withFileTypes: true })
          .filter(d => d.isDirectory() && /^\d+$/.test(d.name))
          .sort((a, b) => parseInt(b.name, 10) - parseInt(a.name, 10));
        for (const hd of hourDirs) {
          paths.push(path.join(datePath, hd.name));
        }
      }
    } catch (_) { /* skip sport on error */ }
  }
  // Also check GEN and OBS root (no date/hour structure)
  for (const sport of ['GEN', 'OBS']) {
    const sportPath = path.join(INCOMING_BASE, sport);
    if (fs.existsSync(sportPath)) paths.push(sportPath);
  }
  return [...new Set(paths)];
}

/** Map curling sheet (A/B/C/D) to VideoFeed(s): C06-MCF.1/2/3/4 and C06-CCU.1/2/3/4. Returns array. */
function sheetToVideoFeeds(sheet, sessionCode) {
  if (!sheet || !/^CUR\d+/i.test(sessionCode || '')) return [];
  const s = (sheet || '').toUpperCase();
  if (/SHEET\s*A\b|^A$/i.test(s) || /\bCUA\b/.test(s)) return ['C06-MCF.1', 'C06-CCU.1'];
  if (/SHEET\s*B\b|^B$/i.test(s) || /\bCUB\b/.test(s)) return ['C06-MCF.2', 'C06-CCU.2'];
  if (/SHEET\s*C\b|^C$/i.test(s) || /\bCUC\b/.test(s)) return ['C06-MCF.3', 'C06-CCU.3'];
  if (/SHEET\s*D\b|^D$/i.test(s) || /\bCUD\b/.test(s)) return ['C06-MCF.4', 'C06-CCU.4'];
  return [];
}

/**
 * Build game-style title for IHO/CUR: "IHO51 M CAN-CZE QF", "CUR38 GBR-JPN W Round Robin"
 */
function buildGameTitle(code, sessionCode, itemName, startList, attr) {
  const uc = (code || '').toUpperCase();
  const sc = (sessionCode || '').toUpperCase();
  const isIHO = uc.startsWith('IHO') || sc.startsWith('IHO');
  const isCUR = uc.startsWith('CUR') || sc.startsWith('CUR') || uc.includes('CURL');
  if (!isIHO && !isCUR) return null;
  const teams = [];
  const list = startList?.Start || startList;
  const arr = Array.isArray(list) ? list : (list ? [list] : []);
  for (const s of arr) {
    const comp = s?.Competitor;
    const c = Array.isArray(comp) ? comp[0] : comp;
    const org = c ? (attr(c, 'Organisation') || '').toUpperCase() : '';
    if (org) teams.push(org.slice(0, 3));
  }
  let gender = 'M';
  if (/Mixed|MIXED/.test(itemName || '')) gender = 'Mixed Doubles';
  else if (/W\s|Women|WOMEN|Woman/.test(itemName || '')) gender = 'W';
  else if (uc.includes('IHOW') || uc.includes('CURW')) gender = 'W';
  // Round Robin: "CUR38 GBR-JPN W Round Robin"
  if (/Round\s*Robin|ROUND\s*ROBIN/.test(itemName || '')) {
    if (teams.length >= 2) {
      return `${sessionCode || ''} ${teams[0]}-${teams[1]} ${gender} Round Robin`.trim();
    }
    return sessionCode ? `${sessionCode} ${gender} Round Robin`.trim() : null;
  }
  // QF/SF/Finals
  let phase = '';
  if (uc.includes('QFNL')) phase = 'QF';
  else if (uc.includes('SFNL')) phase = isCUR ? 'SFs' : 'SF';
  else if (uc.includes('FNL')) phase = 'Final';
  if (!phase) return null;
  if (teams.length >= 2) {
    return gender === 'Mixed Doubles'
      ? `${sessionCode || ''} ${teams[0]}-${teams[1]} Mixed Doubles ${phase}`.trim()
      : `${sessionCode || ''} ${gender} ${teams[0]}-${teams[1]} ${phase}`.trim();
  }
  return sessionCode ? `${sessionCode} ${gender} ${phase}`.trim() : null;
}

/**
 * Extract all Unit elements from parsed ODF XML (Competition.Unit, Session.Unit).
 */
function extractOdfUnits(parsed, attr) {
  const units = [];
  const comp = parsed?.OdfBody?.Competition;
  if (!comp) return units;
  const addUnit = (u) => {
    const code = attr(u, 'Code') || '';
    if (!code) return;
    const itemName = u.ItemName;
    const name = typeof itemName === 'string' ? itemName : (attr(itemName, 'Value') || '');
    const vd = u.VenueDescription;
    let venue = '';
    if (typeof vd === 'string') venue = vd;
    else if (vd && typeof vd === 'object') {
      const vn = attr(vd, 'VenueName') || vd.VenueName || '';
      const ln = attr(vd, 'LocationName') || vd.LocationName || '';
      venue = [vn, ln].filter(Boolean).join(' - ') || (vd.value ?? '');
    }
    const sessionCode = attr(u, 'SessionCode') || '';
    const startList = u.StartList;
    const locationName = (typeof vd === 'string' ? '' : (attr(vd, 'LocationName') || vd?.LocationName || '')) || attr(u, 'Location') || '';
    const videoFeeds = sheetToVideoFeeds(locationName, sessionCode);
    const constructedTitle = buildGameTitle(code, sessionCode, name, startList, attr);
    units.push({
      code,
      sessionCode,
      itemName: name,
      constructedTitle: constructedTitle || name,
      startDate: attr(u, 'StartDate') || '',
      endDate: attr(u, 'EndDate') || '',
      venue,
      videoFeeds
    });
  };
  const unitList = comp.Unit;
  const unitArr = Array.isArray(unitList) ? unitList : (unitList ? [unitList] : []);
  unitArr.forEach(addUnit);
  const sessList = comp.Session;
  const sessArr = Array.isArray(sessList) ? sessList : (sessList ? [sessList] : []);
  for (const s of sessArr) {
    const su = s?.Unit;
    const suArr = Array.isArray(su) ? su : (su ? [su] : []);
    suArr.forEach(addUnit);
  }
  return units;
}

/**
 * Collect ODF schedule units from M: XML files (lightweight: newest folders only).
 * Returns Map<code, { code, itemName, startDate, endDate, venue }> — newest wins.
 */
function collectOdfScheduleUnits() {
  const parser = new XMLParser({ ignoreAttributes: false });
  const attr = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const unitMap = new Map();
  const holderPaths = resolveOdfScheduleHolderPaths();
  let filesRead = 0;
  for (const dirPath of holderPaths) {
    const files = listOdfScheduleFiles(dirPath);
    for (const f of files) {
      try {
        const xmlStr = fs.readFileSync(f.path, 'utf-8');
        filesRead++;
        const parsed = parser.parse(xmlStr);
        const units = extractOdfUnits(parsed, attr);
        const fileVersion = parseInt(attr(parsed?.OdfBody, 'Version') || '0', 10);
        for (const u of units) {
          const existing = unitMap.get(u.code);
          if (!existing || fileVersion >= (existing.version || 0)) {
            const entry = { ...u, version: fileVersion };
            unitMap.set(u.code, entry);
            const sc = (u.sessionCode || '').trim();
            if (u.videoFeeds && u.videoFeeds.length > 0 && sc) {
              for (const vf of u.videoFeeds) unitMap.set(`${sc}:${vf}`, entry);
            } else if (sc) {
              unitMap.set(sc, entry);
            }
          }
        }
      } catch (_) { /* skip bad file */ }
    }
  }
  return { unitMap, filesRead };
}

/**
 * Format ODF ISO date-time to DD/MM/YYYY and HH:MM:SS for CSV rawData.
 */
function odfDateToCsvFormat(isoStr) {
  if (!isoStr || typeof isoStr !== 'string') return { date: '', time: '' };
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return { date: '', time: '' };
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    const s = String(d.getUTCSeconds()).padStart(2, '0');
    return {
      date: `${day}/${month}/${year}`,
      time: `${h}:${m}:${s}`
    };
  } catch (_) { return { date: '', time: '' }; }
}

/**
 * Merge ODF schedule units into events by Es Code / VideoFeed.
 * Updates rawData (Es Start Time, Es End Time, Es Date, Title, Es Venue). Preserves Id, ChannelName, Tx times.
 * Returns number of events that had at least one field updated.
 */
function mergeOdfScheduleIntoEvents(events, unitMap) {
  if (!Array.isArray(events) || events.length === 0 || !unitMap || unitMap.size === 0) return 0;
  let eventsUpdated = 0;
  for (const event of events) {
    const raw = event.rawData || {};
    const esCode = raw['Es Code'] || raw['EsCode'] || '';
    const videoFeed = raw['VideoFeed'] || raw['Video Feed'] || '';
    const compoundKey = (esCode && videoFeed) ? `${esCode}:${videoFeed}` : '';
    const unit = (compoundKey && unitMap.get(compoundKey)) || unitMap.get(esCode);
    if (!unit) continue;
    let changed = false;
    const startFmt = odfDateToCsvFormat(unit.startDate);
    const endFmt = odfDateToCsvFormat(unit.endDate);
    const title = unit.constructedTitle || unit.itemName;
    if (title && title !== raw['Title']) {
      raw['Title'] = title;
      event.title = title;
      changed = true;
    }
    if (startFmt.time && startFmt.time !== raw['Es Start Time']) {
      raw['Es Start Time'] = startFmt.time;
      changed = true;
    }
    if (endFmt.time && endFmt.time !== raw['Es End Time']) {
      raw['Es End Time'] = endFmt.time;
      changed = true;
    }
    if (startFmt.date && startFmt.date !== raw['Es Date']) {
      raw['Es Date'] = startFmt.date;
      if (event.date !== startFmt.date) event.date = startFmt.date;
      changed = true;
    }
    if (unit.venue && unit.venue !== raw['Es Venue']) {
      raw['Es Venue'] = unit.venue;
      changed = true;
    }
    if (changed) eventsUpdated++;
  }
  return eventsUpdated;
}

/** Last run timestamp and guard to avoid overlapping runs. */
let _odfScheduleLastRun = 0;
let _odfScheduleRunning = false;

/**
 * Run ODF schedule merge: scan M:, parse XML, merge into eventsData. Runs hourly.
 */
function runOdfScheduleMerge() {
  if (!ODF_SCHEDULE_MERGE_ENABLED || _odfScheduleRunning) return;
  if (eventsData.length === 0) return; // No CSV loaded yet
  _odfScheduleRunning = true;
  try {
    const { unitMap, filesRead } = collectOdfScheduleUnits();
    const count = mergeOdfScheduleIntoEvents(eventsData, unitMap);
    _odfScheduleLastRun = Date.now();
    if (count > 0) {
      const eventsJsonPath = path.join(__dirname, 'events.json');
      fs.writeFileSync(eventsJsonPath, JSON.stringify(eventsData, null, 2));
    }
    pushScheduleUpdatesToSupabase(unitMap);
    if (count > 0) {
      console.log(`ODF schedule merge: updated ${count} event(s) from ${unitMap.size} ODF units (${filesRead} files read)`);
    }
  } catch (err) {
    console.error('ODF schedule merge error:', err.message);
  } finally {
    _odfScheduleRunning = false;
  }
}

/**
 * List Luge result files: DT_CUMULATIVE_RESULT_* (cumulative standings) plus
 * DT_RESULT_*RELAY* (relay uses DT_RESULT, not cumulative).
 */
function listLugeResultFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(f => f.includes('DT_CUMULATIVE_RESULT_') || (f.includes('DT_RESULT_') && /RELAY/i.test(f)))
    .map(f => {
      const filePath = path.join(dirPath, f);
      let stat;
      try { stat = fs.statSync(filePath); } catch (_) { return null; }
      if (!stat.isFile()) return null;
      return { name: f, path: filePath, mtime: stat.mtime };
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
}

/**
 * Find all distinct IHO games in a directory. Returns Map of gameKey -> { path, mtime, data }.
 * Only parses the newest `limit` files to keep M: drive reads fast.
 */
function findAllIHOGamesInDir(dirPath, limit = 20) {
  const files = listDTResultFiles(dirPath);
  const games = new Map();
  for (const { path: filePath, mtime } of files.slice(0, limit)) {
    try {
      const xmlStr = fs.readFileSync(filePath, 'utf-8');
      const data = parseDTResultXml(xmlStr);
      const hc = data.homeTeam?.code?.toUpperCase();
      const ac = data.awayTeam?.code?.toUpperCase();
      if (!hc || !ac) continue;
      const gameKey = `${hc}-${ac}-${data.date || ''}`;
      const altKey = `${ac}-${hc}-${data.date || ''}`;
      // Keep the newest file per game (files sorted newest-first, so first hit wins)
      if (!games.has(gameKey) && !games.has(altKey)) {
        games.set(gameKey, { path: filePath, mtime, data });
      }
    } catch { continue; }
  }
  return games;
}

/**
 * Cache: maps "HOME-AWAY" -> game code (e.g. "GPC-000200") to speed up file lookups.
 * Once we learn that LAT-USA = GPC-000200, we can filter filenames without reading XML.
 */
const _gameCodeCache = new Map();

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

  // If we know the game code for this matchup, filter files by filename first (much faster)
  if (wantMatch) {
    const cacheKey1 = `${home}-${away}`;
    const cacheKey2 = `${away}-${home}`;
    const cachedCode = _gameCodeCache.get(cacheKey1) || _gameCodeCache.get(cacheKey2);
    if (cachedCode) {
      const filtered = files.filter(f => f.name.includes(cachedCode));
      if (filtered.length > 0) {
        const { path: filePath, mtime } = filtered[0];
        try {
          const xmlStr = fs.readFileSync(filePath, 'utf-8');
          const data = parseDTResultXml(xmlStr);
          return { path: filePath, mtime, data };
        } catch { /* fall through to full scan */ }
      }
    } else {
      // Pre-populate cache: extract unique game codes from filenames, read one file per code
      const codeToFile = new Map();
      for (const f of files) {
        const m = f.name.match(/(GP[A-Z]-\d{6})/);
        if (m && !codeToFile.has(m[1])) codeToFile.set(m[1], f);
      }
      for (const [code, f] of codeToFile) {
        try {
          const xmlStr = fs.readFileSync(f.path, 'utf-8');
          const data = parseDTResultXml(xmlStr);
          const dh = data.homeTeam?.code?.toUpperCase();
          const da = data.awayTeam?.code?.toUpperCase();
          if (dh && da) _gameCodeCache.set(`${dh}-${da}`, code);
          if ((dh === home && da === away) || (dh === away && da === home)) {
            return { path: f.path, mtime: f.mtime, data };
          }
        } catch { continue; }
      }
      // If we found game codes but none matched, no point scanning all files
      if (codeToFile.size > 0) return null;
      // No game codes in filenames (e.g. 8FNL format) — deduplicate by document signature
      // and read only one file per unique game to avoid scanning hundreds of identical files
      const sigToFile = new Map();
      for (const f of files) {
        const sig = f.name.replace(/^\d+_\d+_/, '');
        if (!sigToFile.has(sig)) sigToFile.set(sig, f);
      }
      for (const [, f] of sigToFile) {
        try {
          const xmlStr = fs.readFileSync(f.path, 'utf-8');
          const data = parseDTResultXml(xmlStr);
          const dh = data.homeTeam?.code?.toUpperCase();
          const da = data.awayTeam?.code?.toUpperCase();
          if ((dh === home && da === away) || (dh === away && da === home)) {
            return { path: f.path, mtime: f.mtime, data };
          }
        } catch { continue; }
      }
      return null;
    }
  }

  for (const { name: fileName, path: filePath, mtime } of files) {
    try {
      const xmlStr = fs.readFileSync(filePath, 'utf-8');
      const data = parseDTResultXml(xmlStr);
      const dataHome = data.homeTeam?.code?.toUpperCase();
      const dataAway = data.awayTeam?.code?.toUpperCase();
      // Cache game code for this matchup
      if (dataHome && dataAway) {
        const codeMatch = fileName.match(/(GP[A-Z]-\d{6})/);
        if (codeMatch) {
          _gameCodeCache.set(`${dataHome}-${dataAway}`, codeMatch[1]);
        }
      }
      if (!wantMatch) return { path: filePath, mtime, data };
      if ((dataHome === home && dataAway === away) || (dataHome === away && dataAway === home)) {
        return { path: filePath, mtime, data };
      }
    } catch (_) {
      continue;
    }
  }
  if (wantMatch) return null;
  const { path: filePath, mtime } = files[0];
  const xmlStr = fs.readFileSync(filePath, 'utf-8');
  const data = parseDTResultXml(xmlStr);
  return { path: filePath, mtime, data };
}

/**
 * Find Curling DT_RESULT file. If home/away provided, find first file whose parsed data matches.
 * When wantMatch and no match found, returns null (don't return wrong game).
 */
function findDTResultFileCurling(dirPath, homeCode, awayCode) {
  const files = listDTResultFiles(dirPath);
  if (files.length === 0) return null;
  const home = homeCode?.trim()?.toUpperCase();
  const away = awayCode?.trim()?.toUpperCase();
  const wantMatch = home && away;
  for (const { path: filePath, mtime } of files) {
    try {
      const xmlStr = fs.readFileSync(filePath, 'utf-8');
      const data = parseDTResultXmlCurling(xmlStr);
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
  if (wantMatch) return null;
  const { path: filePath, mtime } = files[0];
  const xmlStr = fs.readFileSync(filePath, 'utf-8');
  const data = parseDTResultXmlCurling(xmlStr);
  return { path: filePath, mtime, data };
}

/**
 * Parse Luge DT_RESULT XML. Returns run number (from DocumentCode FNL-000N00), resultStatus, eventName, subEventName, results (top 10).
 * For START_LIST, Result has no Rank/Result - use SortOrder as rank and empty result.
 */
function parseDTResultXmlLuge(xmlStr) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xmlStr);
  const body = parsed?.OdfBody;
  if (!body) throw new Error('Invalid Luge DT_RESULT: no OdfBody');
  const comp = body.Competition;
  if (!comp) throw new Error('Invalid Luge DT_RESULT: no Competition');
  const attr = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const resultStatus = attr(body, 'ResultStatus') || '';
  const date = attr(body, 'Date') || '';
  let run = null;
  let eventCode = '';
  const docCode = attr(body, 'DocumentCode') || '';
  const runMatch = docCode.match(/FNL-000(\d)00/);
  if (runMatch) run = parseInt(runMatch[1], 10);
  const codeMatch = docCode.match(/^([A-Z0-9]+)/);
  if (codeMatch) eventCode = codeMatch[1];
  let eventName = '';
  let subEventName = '';
  const extInfos = comp.ExtendedInfos;
  if (extInfos?.SportDescription) {
    const sd = extInfos.SportDescription;
    eventName = attr(sd, 'EventName') || attr(sd, 'DisciplineName') || '';
    subEventName = attr(sd, 'SubEventName') || '';
  }
  const rawResults = comp.Result;
  const resultList = Array.isArray(rawResults) ? rawResults : (rawResults ? [rawResults] : []);
  const results = resultList.slice(0, 10).map((r) => {
    const rank = parseInt(attr(r, 'Rank'), 10) || parseInt(attr(r, 'SortOrder'), 10) || 0;
    const resultTime = attr(r, 'Result') || '';
    const competitor = r.Competitor;
    const organisation = competitor ? (attr(competitor, 'Organisation') || '').toUpperCase() : '';
    const compType = competitor ? (attr(competitor, 'Type') || '').toUpperCase() : '';
    let givenName = '';
    let familyName = '';
    let displayName = '';
    const compDesc = competitor?.Description;
    if (compType === 'T') {
      // Team event (relay): use TeamName as display, skip individual athlete names
      const teamName = compDesc ? (attr(compDesc, 'TeamName') || compDesc.TeamName || '') : '';
      displayName = teamName.trim() || organisation;
    } else {
      // Individual / doubles: use TeamName (doubles) or athlete names
      if (compDesc && (attr(compDesc, 'TeamName') || compDesc.TeamName)) {
        displayName = (attr(compDesc, 'TeamName') || compDesc.TeamName || '').trim();
      }
      const composition = competitor?.Composition;
      const athletes = composition?.Athlete;
      const athleteArr = Array.isArray(athletes) ? athletes : (athletes ? [athletes] : []);
      const firstAthlete = athleteArr[0];
      if (firstAthlete?.Description) {
        const desc = firstAthlete.Description;
        givenName = attr(desc, 'GivenName') || '';
        familyName = attr(desc, 'FamilyName') || '';
      }
      if (!displayName && (givenName || familyName)) {
        displayName = [givenName, familyName].filter(Boolean).join(' ').trim();
      }
    }
    return { rank, organisation, givenName, familyName, displayName: displayName || undefined, result: resultTime };
  });
  return {
    run,
    eventCode,
    resultStatus,
    date,
    eventName,
    subEventName,
    results
  };
}

/**
 * Parse Speed Skating DT_RESULT XML. Returns run (from FNL-000N00), eventCode, resultStatus, eventName, subEventName, results (top 10).
 */
function parseDTResultXmlSSK(xmlStr) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xmlStr);
  const body = parsed?.OdfBody;
  if (!body) throw new Error('Invalid SSK DT_RESULT: no OdfBody');
  const comp = body.Competition;
  if (!comp) throw new Error('Invalid SSK DT_RESULT: no Competition');
  const attr = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const resultStatus = attr(body, 'ResultStatus') || '';
  const date = attr(body, 'Date') || '';
  let run = null;
  let eventCode = '';
  const docCode = attr(body, 'DocumentCode') || '';
  const runMatch = docCode.match(/FNL-000(\d)00/);
  if (runMatch) run = parseInt(runMatch[1], 10);
  const codeMatch = docCode.match(/^([A-Z0-9]+)/);
  if (codeMatch) eventCode = codeMatch[1];
  let eventName = '';
  let subEventName = '';
  const extInfos = comp.ExtendedInfos;
  if (extInfos?.SportDescription) {
    const sd = extInfos.SportDescription;
    eventName = attr(sd, 'EventName') || attr(sd, 'DisciplineName') || '';
    subEventName = attr(sd, 'SubEventName') || '';
  }
  const rawResults = comp.Result;
  const resultList = Array.isArray(rawResults) ? rawResults : (rawResults ? [rawResults] : []);
  const results = resultList.filter(r => attr(r, 'Rank') != null || attr(r, 'SortOrder') != null).slice(0, 10).map((r) => {
    const rank = parseInt(attr(r, 'Rank'), 10) || parseInt(attr(r, 'SortOrder'), 10) || 0;
    const resultTime = attr(r, 'Result') || (attr(r, 'IRM') ? attr(r, 'IRM') : '');
    const competitor = r.Competitor;
    const organisation = competitor ? (attr(competitor, 'Organisation') || '').toUpperCase() : '';
    let givenName = '';
    let familyName = '';
    const composition = competitor?.Composition;
    const athletes = composition?.Athlete;
    const athleteArr = Array.isArray(athletes) ? athletes : (athletes ? [athletes] : []);
    const firstAthlete = athleteArr[0];
    if (firstAthlete?.Description) {
      const desc = firstAthlete.Description;
      givenName = attr(desc, 'GivenName') || '';
      familyName = attr(desc, 'FamilyName') || '';
    }
    const displayName = [givenName, familyName].filter(Boolean).join(' ').trim() || undefined;
    return { rank, organisation, givenName, familyName, displayName, result: resultTime };
  });
  const isFinal = docCode.includes('FNL');
  return {
    run,
    eventCode,
    isFinal,
    resultStatus,
    date,
    eventName,
    subEventName,
    results
  };
}

/**
 * Parse a Short Track Speed Skating DT_RESULT XML.
 * Identical structure to SSK but with QFNL/SFNL/FNL phases.
 * Phase priority: FNL > SFNL > QFNL (higher = preferred for display).
 */
function parseDTResultXmlSTK(xmlStr) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xmlStr);
  const body = parsed?.OdfBody;
  if (!body) throw new Error('Invalid STK DT_RESULT: no OdfBody');
  const comp = body.Competition;
  if (!comp) throw new Error('Invalid STK DT_RESULT: no Competition');
  const attr = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const resultStatus = attr(body, 'ResultStatus') || '';
  const date = attr(body, 'Date') || '';
  const docCode = attr(body, 'DocumentCode') || '';
  // Extract event code (e.g. STKW500M or STKM1000M)
  const codeMatch = docCode.match(/^([A-Z0-9]+?)[-\s]*(?:QFNL|SFNL|FNL)/);
  const eventCode = codeMatch ? codeMatch[1] : (docCode.match(/^([A-Z0-9]+)/)?.[1] || '');
  // Determine phase: FNL (not preceded by Q or S) = final, SFNL = semifinal, QFNL = quarterfinal
  let phase = 'UNKNOWN';
  let phasePriority = 0;
  if (/(?<![QS])FNL/.test(docCode)) { phase = 'FNL'; phasePriority = 3; }
  else if (/SFNL/.test(docCode)) { phase = 'SFNL'; phasePriority = 2; }
  else if (/QFNL/.test(docCode)) { phase = 'QFNL'; phasePriority = 1; }
  let eventName = '';
  let subEventName = '';
  const extInfos = comp.ExtendedInfos;
  if (extInfos?.SportDescription) {
    const sd = extInfos.SportDescription;
    eventName = attr(sd, 'EventName') || attr(sd, 'DisciplineName') || '';
    subEventName = attr(sd, 'SubEventName') || '';
  }
  const rawResults = comp.Result;
  const resultList = Array.isArray(rawResults) ? rawResults : (rawResults ? [rawResults] : []);
  const results = resultList.filter(r => attr(r, 'Rank') != null || attr(r, 'SortOrder') != null).slice(0, 10).map((r) => {
    const rank = parseInt(attr(r, 'Rank'), 10) || parseInt(attr(r, 'SortOrder'), 10) || 0;
    const resultTime = attr(r, 'Result') || (attr(r, 'IRM') ? attr(r, 'IRM') : '');
    const competitor = r.Competitor;
    const organisation = competitor ? (attr(competitor, 'Organisation') || '').toUpperCase() : '';
    let givenName = '';
    let familyName = '';
    const composition = competitor?.Composition;
    const athletes = composition?.Athlete;
    const athleteArr = Array.isArray(athletes) ? athletes : (athletes ? [athletes] : []);
    const firstAthlete = athleteArr[0];
    if (firstAthlete?.Description) {
      const desc = firstAthlete.Description;
      givenName = attr(desc, 'GivenName') || '';
      familyName = attr(desc, 'FamilyName') || '';
    }
    const displayName = [givenName, familyName].filter(Boolean).join(' ').trim() || undefined;
    return { rank, organisation, givenName, familyName, displayName, result: resultTime };
  });
  return {
    eventCode,
    phase,
    phasePriority,
    isFinal: phase === 'FNL',
    resultStatus,
    date,
    eventName,
    subEventName,
    results
  };
}

/** In-memory cache for Luge live payload to avoid re-scanning the drive on every request. */
const LUG_CACHE_TTL_MS = 18 * 1000;
let lugCache = { payload: null, expires: 0 };

/** In-memory cache for SSK live payload. */
const SSK_CACHE_TTL_MS = 18 * 1000;
let sskCache = { payload: null, expires: 0 };

/** In-memory cache for STK live payload. */
const STK_CACHE_TTL_MS = 18 * 1000;
let stkCache = { payload: null, expires: 0 };

/** In-memory cache for SBD live payload. */
const SBD_CACHE_TTL_MS = 18 * 1000;
let sbdCache = { payload: null, expires: 0 };

/**
 * Parse a Snowboard DT_RESULT XML (scored events – halfpipe, slopestyle, big air).
 * Results are POINTS (0-100) not TIME.
 */
function parseDTResultXmlSBD(xmlStr) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xmlStr);
  const body = parsed?.OdfBody;
  if (!body) throw new Error('Invalid SBD DT_RESULT: no OdfBody');
  const comp = body.Competition;
  if (!comp) throw new Error('Invalid SBD DT_RESULT: no Competition');
  const attr = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const resultStatus = attr(body, 'ResultStatus') || '';
  const date = attr(body, 'Date') || '';
  const docCode = attr(body, 'DocumentCode') || '';
  const docType = attr(body, 'DocumentType') || '';
  const isPhaseResult = docType === 'DT_PHASE_RESULT';
  // Extract event code (e.g. SBDWHP or SBDMHP)
  const codeMatch = docCode.match(/^([A-Z0-9]+?)[-\s]*(?:FNL|SFNL|QFNL)/);
  const eventCode = codeMatch ? codeMatch[1] : (docCode.match(/^([A-Z0-9]+)/)?.[1] || '');
  // Extract run number from FNL-000X00 pattern
  let runNum = null;
  const runMatch = docCode.match(/FNL-000(\d)00/);
  if (runMatch) runNum = parseInt(runMatch[1], 10);
  let eventName = '';
  let subEventName = '';
  const extInfos = comp.ExtendedInfos;
  if (extInfos?.SportDescription) {
    const sd = extInfos.SportDescription;
    eventName = attr(sd, 'EventName') || attr(sd, 'DisciplineName') || '';
    subEventName = attr(sd, 'SubEventName') || '';
  }
  const rawResults = comp.Result;
  const resultList = Array.isArray(rawResults) ? rawResults : (rawResults ? [rawResults] : []);
  const results = resultList.filter(r => attr(r, 'Rank') != null || attr(r, 'SortOrder') != null).slice(0, 12).map((r) => {
    const rank = parseInt(attr(r, 'Rank'), 10) || parseInt(attr(r, 'SortOrder'), 10) || 0;
    const resultVal = attr(r, 'Result') || (attr(r, 'IRM') ? attr(r, 'IRM') : '');
    const resultType = attr(r, 'ResultType') || '';
    const competitor = r.Competitor;
    const organisation = competitor ? (attr(competitor, 'Organisation') || '').toUpperCase() : '';
    let givenName = '';
    let familyName = '';
    const composition = competitor?.Composition;
    const athletes = composition?.Athlete;
    const athleteArr = Array.isArray(athletes) ? athletes : (athletes ? [athletes] : []);
    const firstAthlete = athleteArr[0];
    if (firstAthlete?.Description) {
      const desc = firstAthlete.Description;
      givenName = attr(desc, 'GivenName') || '';
      familyName = attr(desc, 'FamilyName') || '';
    }
    const displayName = [givenName, familyName].filter(Boolean).join(' ').trim() || undefined;
    return { rank, organisation, givenName, familyName, displayName, result: resultVal, resultType };
  });
  return {
    eventCode,
    runNum,
    isPhaseResult,
    resultStatus,
    date,
    eventName,
    subEventName,
    results
  };
}

/**
 * Parse DT_SCHEDULE_UPDATE XMLs to extract run timing for SBD events.
 * Aggregates all schedule updates, keeping the latest status per unit code.
 * Returns array of { code, name, status, startDate, endDate } sorted by start time.
 */
function parseSBDScheduleUpdates(holderPaths) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const attr = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const unitMap = new Map();
  for (const dirPath of holderPaths) {
    const files = listSBDScheduleFiles(dirPath);
    // Only read newest 20 schedule update files to limit I/O
    for (const f of files.slice(0, 20)) {
      try {
        const xmlStr = fs.readFileSync(f.path, 'utf-8');
        const parsed = parser.parse(xmlStr);
        const units = parsed?.OdfBody?.Competition?.Unit;
        const unitArr = Array.isArray(units) ? units : (units ? [units] : []);
        const fileVersion = parseInt(attr(parsed?.OdfBody, 'Version') || '0', 10);
        for (const u of unitArr) {
          const code = attr(u, 'Code') || '';
          // Only include halfpipe/scored SBD units (not general schedule items)
          if (!code.includes('SBD')) continue;
          const existing = unitMap.get(code);
          if (!existing || fileVersion >= existing.version) {
            const itemName = u.ItemName;
            const name = typeof itemName === 'string' ? itemName : (attr(itemName, 'Value') || '');
            unitMap.set(code, {
              code,
              name,
              status: attr(u, 'ScheduleStatus') || '',
              startDate: attr(u, 'StartDate') || '',
              endDate: attr(u, 'EndDate') || '',
              version: fileVersion
            });
          }
        }
      } catch (_) { /* skip bad files */ }
    }
  }
  // Return only run-level units (containing FNL-000), sorted by start time
  return Array.from(unitMap.values())
    .filter(u => /FNL-\d{6}/.test(u.code))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/**
 * Find all SBD scored results. Groups per-run DT_RESULT files by event+run,
 * also retrieves DT_PHASE_RESULT for overall standings and DT_SCHEDULE_UPDATE for run timing.
 * Returns { eventCode: 'SBD', eventName, lastUpdated, runs, runSchedule }.
 */
async function findAllSBDRuns() {
  const holderPaths = resolveSBDHolderPaths();
  const allFiles = [];
  for (const dirPath of holderPaths) {
    const files = listSBDResultFiles(dirPath);
    for (const f of files) {
      allFiles.push({ path: f.path, mtime: f.mtime });
    }
  }
  const read = fs.promises.readFile;
  const parsed = await Promise.all(
    allFiles.map(async ({ path: filePath, mtime }) => {
      try {
        const xmlStr = await read(filePath, 'utf-8');
        const data = parseDTResultXmlSBD(xmlStr);
        return { mtime, data };
      } catch (_) {
        return null;
      }
    })
  );
  // Separate phase results (overall) from per-run results
  const perRunMap = new Map(); // key: "eventCode::runNum" or "eventCode::subEventName"
  const phaseMap = new Map();  // key: eventCode
  let latestMtime = null;
  for (const item of parsed) {
    if (!item) continue;
    const { mtime, data } = item;
    if (!latestMtime || mtime > latestMtime) latestMtime = mtime;
    if (data.isPhaseResult) {
      const key = data.eventCode || 'SBD';
      const existing = phaseMap.get(key);
      if (!existing || mtime > existing.mtime) {
        phaseMap.set(key, { mtime, data });
      }
    } else if (data.results?.length > 0) {
      const key = `${data.eventCode || 'SBD'}::${data.subEventName || data.runNum || 'run'}`;
      const existing = perRunMap.get(key);
      if (!existing || mtime > existing.mtime) {
        perRunMap.set(key, { mtime, data });
      }
    }
  }
  // Build runs from per-run results, sorted by run number (Run 1 → Run 2 → Run 3)
  const runs = Array.from(perRunMap.values())
    .sort((a, b) => {
      const codeComp = (a.data.eventCode || '').localeCompare(b.data.eventCode || '');
      if (codeComp !== 0) return codeComp;
      return (a.data.runNum || 0) - (b.data.runNum || 0);
    })
    .map(({ data }) => ({
      eventCode: data.eventCode || 'SBD',
      runNum: data.runNum,
      subEventName: data.subEventName || `Run ${data.runNum || '?'}`,
      eventName: data.eventName || '',
      resultStatus: data.resultStatus,
      results: data.results || []
    }));
  // Get phase result (overall standings) if available
  let phaseResults = null;
  for (const [, { data }] of phaseMap) {
    if (data.results?.length > 0) {
      phaseResults = {
        eventCode: data.eventCode,
        eventName: data.eventName,
        subEventName: data.subEventName || 'Overall',
        resultStatus: data.resultStatus,
        results: data.results
      };
    }
  }
  // Get run schedule/timing from DT_SCHEDULE_UPDATE
  let runSchedule = [];
  try {
    runSchedule = parseSBDScheduleUpdates(holderPaths);
  } catch (_) { /* ignore schedule parse errors */ }
  // Determine event names
  const eventNames = parsed.filter(Boolean).map(p => p.data.eventName).filter(Boolean);
  const uniqueNames = [...new Set(eventNames)];
  const overallName = uniqueNames.length === 1 ? uniqueNames[0] : (uniqueNames.length > 0 ? 'Snowboard' : '');
  return {
    eventCode: 'SBD',
    eventName: overallName,
    lastUpdated: latestMtime ? latestMtime.toISOString() : null,
    runs,
    phaseResults,
    runSchedule
  };
}

/**
 * Find all Luge result files across holder paths: DT_CUMULATIVE_RESULT (standings) + DT_RESULT RELAY.
 * Returns { eventCode: 'LUG', eventName, lastUpdated, runs } with one run per event.
 */
async function findAllLugeRuns() {
  const holderPaths = resolveLUGHolderPaths();
  const allFiles = [];
  for (const dirPath of holderPaths) {
    const files = listLugeResultFiles(dirPath);
    for (const f of files) {
      allFiles.push({ path: f.path, mtime: f.mtime });
    }
  }
  const read = fs.promises.readFile;
  const parsed = await Promise.all(
    allFiles.map(async ({ path: filePath, mtime }) => {
      try {
        const xmlStr = await read(filePath, 'utf-8');
        const data = parseDTResultXmlLuge(xmlStr);
        const baseName = path.basename(filePath, path.extname(filePath));
        const match = baseName.match(/DT_(?:CUMULATIVE_)?RESULT_([A-Z0-9]+)/i);
        if (match && !data.eventCode) data.eventCode = match[1].toUpperCase();
        return { mtime, data };
      } catch (_) {
        return null;
      }
    })
  );
  const byEventCode = new Map();
  let latestMtime = null;
  for (const item of parsed) {
    if (!item || (!item.data.eventCode && !item.data.results?.length)) continue;
    const { mtime, data } = item;
    const code = data.eventCode || 'LUG';
    const existing = byEventCode.get(code);
    if (!existing || mtime > existing.mtime) {
      byEventCode.set(code, { mtime, data });
      if (!latestMtime || mtime > latestMtime) latestMtime = mtime;
    }
  }
  const runs = Array.from(byEventCode.values())
    .sort((a, b) => (a.data.eventCode || '').localeCompare(b.data.eventCode || ''))
    .map(({ data }) => ({
      eventCode: data.eventCode || 'LUG',
      run: 1,
      subEventName: data.eventName || data.subEventName || 'Results',
      resultStatus: data.resultStatus,
      results: data.results || []
    }));
  return {
    eventCode: 'LUG',
    eventName: 'Luge',
    lastUpdated: latestMtime ? latestMtime.toISOString() : null,
    runs
  };
}

/**
 * Find all SSK DT_RESULT files across holder paths. Prefers FNL (final) when multiple files per event.
 * Returns { eventCode, eventName, lastUpdated, runs } with one run per event (Men's 1000m, Women's 500m, etc).
 */
async function findAllSSKRuns() {
  const holderPaths = resolveSSKHolderPaths();
  const allFiles = [];
  for (const dirPath of holderPaths) {
    const files = listSSKResultFiles(dirPath);
    for (const f of files) {
      allFiles.push({ path: f.path, mtime: f.mtime });
    }
  }
  const read = fs.promises.readFile;
  const parsed = await Promise.all(
    allFiles.map(async ({ path: filePath, mtime }) => {
      try {
        const xmlStr = await read(filePath, 'utf-8');
        const data = parseDTResultXmlSSK(xmlStr);
        const baseName = path.basename(filePath, path.extname(filePath));
        const match = baseName.match(/DT_RESULT[_\-]?([A-Z0-9]+)/i);
        if (match && !data.eventCode) data.eventCode = match[1].toUpperCase();
        return { mtime, data };
      } catch (_) {
        return null;
      }
    })
  );
  const byEventCode = new Map();
  let eventName = '';
  let eventCode = '';
  let latestMtime = null;
  for (const item of parsed) {
    if (!item || (!item.data.eventCode && !item.data.results?.length)) continue;
    const { mtime, data } = item;
    const code = data.eventCode || 'SSK';
    const existing = byEventCode.get(code);
    const preferThis = !existing ||
      (data.isFinal && !existing.data.isFinal) ||
      (data.isFinal === existing.data.isFinal && mtime > existing.mtime);
    if (preferThis) {
      byEventCode.set(code, { mtime, data });
      if (data.eventName) eventName = data.eventName;
      if (data.eventCode) eventCode = data.eventCode;
      if (!latestMtime || mtime > latestMtime) latestMtime = mtime;
    }
  }
  const runs = Array.from(byEventCode.values())
    .sort((a, b) => (a.data.eventCode || '').localeCompare(b.data.eventCode || ''))
    .map(({ data }) => ({
      eventCode: data.eventCode || 'SSK',
      run: data.run != null ? data.run : 1,
      subEventName: data.eventName || data.subEventName || 'Results',
      resultStatus: data.resultStatus,
      results: data.results || []
    }));
  return {
    eventCode: eventCode || 'SSK',
    eventName,
    lastUpdated: latestMtime ? latestMtime.toISOString() : null,
    runs
  };
}

/**
 * Find all STK DT_RESULT files across holder paths. Groups by event+phase (subEventName).
 * Within each event, shows all phases (QF heats, SF heats, Final) as separate runs.
 * Prefers the highest-phase result per sub-event name (FNL > SFNL > QFNL).
 * Returns { eventCode: 'STK', eventName, lastUpdated, runs }.
 */
async function findAllSTKRuns() {
  const holderPaths = resolveSTKHolderPaths();
  const allFiles = [];
  for (const dirPath of holderPaths) {
    const files = listSTKResultFiles(dirPath);
    for (const f of files) {
      allFiles.push({ path: f.path, mtime: f.mtime });
    }
  }
  const read = fs.promises.readFile;
  const parsed = await Promise.all(
    allFiles.map(async ({ path: filePath, mtime }) => {
      try {
        const xmlStr = await read(filePath, 'utf-8');
        const data = parseDTResultXmlSTK(xmlStr);
        return { mtime, data };
      } catch (_) {
        return null;
      }
    })
  );
  // Group by subEventName (e.g. "Quarterfinal 1", "Semifinal 2", "Final")
  // Each unique subEventName becomes a run entry
  const bySubEvent = new Map();
  let latestMtime = null;
  for (const item of parsed) {
    if (!item || !item.data.results?.length) continue;
    const { mtime, data } = item;
    // Key by the full subEventName for uniqueness (e.g. "Quarterfinal 1" vs "Quarterfinal 2")
    const key = `${data.eventCode || 'STK'}::${data.subEventName || data.eventName || 'Results'}`;
    const existing = bySubEvent.get(key);
    // Prefer higher phase priority, then newer mtime
    const preferThis = !existing ||
      (data.phasePriority > existing.data.phasePriority) ||
      (data.phasePriority === existing.data.phasePriority && mtime > existing.mtime);
    if (preferThis) {
      bySubEvent.set(key, { mtime, data });
    }
    if (!latestMtime || mtime > latestMtime) latestMtime = mtime;
  }
  // Build runs: sort by event code then phase priority (QF first, FNL last)
  const runs = Array.from(bySubEvent.values())
    .sort((a, b) => {
      const codeComp = (a.data.eventCode || '').localeCompare(b.data.eventCode || '');
      if (codeComp !== 0) return codeComp;
      // Within same event, higher phase priority = first in list (FNL→SF→QF)
      const phaseDiff = b.data.phasePriority - a.data.phasePriority;
      if (phaseDiff !== 0) return phaseDiff;
      return (a.data.subEventName || '').localeCompare(b.data.subEventName || '');
    })
    .map(({ data }) => ({
      eventCode: data.eventCode || 'STK',
      run: 1,
      subEventName: data.subEventName || data.eventName || 'Results',
      eventName: data.eventName || '',
      phase: data.phase,
      resultStatus: data.resultStatus,
      results: data.results || []
    }));
  // Determine overall event name from the most common eventName
  const eventNames = parsed.filter(Boolean).map(p => p.data.eventName).filter(Boolean);
  const overallName = eventNames.length > 0 ? 'Short Track Speed Skating' : '';
  return {
    eventCode: 'STK',
    eventName: overallName,
    lastUpdated: latestMtime ? latestMtime.toISOString() : null,
    runs
  };
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
 * Extract MINS value from StatsItem with Type="GAME" Code="MINS" Pos="TOT".
 * Returns value string like "27:26" or null.
 */
function getGoalieMinsStat(statsItems) {
  if (!statsItems || !Array.isArray(statsItems)) return null;
  const item = statsItems.find(s => {
    const t = s['@_Type'] ?? s.Type;
    const c = s['@_Code'] ?? s.Code;
    const p = s['@_Pos'] ?? s.Pos;
    return (t === 'GAME' || !t) && c === 'MINS' && (p === 'TOT' || p == null);
  });
  if (!item) return null;
  const v = item['@_Value'] ?? item.Value;
  return v !== undefined && v !== null ? String(v) : null;
}

/**
 * Parse "MM:SS" or "M:SS" to total seconds.
 */
function parseMinsToSeconds(minsStr) {
  if (!minsStr || typeof minsStr !== 'string') return null;
  const m = minsStr.trim().match(/^(\d+):(\d{2})$/);
  if (!m) return null;
  const min = parseInt(m[1], 10);
  const sec = parseInt(m[2], 10);
  if (isNaN(min) || isNaN(sec) || sec >= 60) return null;
  return min * 60 + sec;
}

/**
 * Check if athlete is a goalkeeper (ODF EventUnitEntry Role/Position or SVS stat).
 */
function isGoalkeeper(athlete) {
  const attr = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const eue = athlete?.EventUnitEntry;
  const entries = Array.isArray(eue) ? eue : (eue ? [eue] : []);
  for (const e of entries) {
    const code = (attr(e, 'Code') || '').toUpperCase();
    const value = (attr(e, 'Value') || '').toUpperCase();
    if ((code === 'ROLE' || code === 'POSITION' || code === 'ATHLETE_ROLE') &&
        (value === 'GK' || value === 'G' || value === 'GOALKEEPER' || value.includes('GOAL'))) {
      return true;
    }
  }
  const stats = athlete?.StatsItems?.StatsItem;
  const sArr = Array.isArray(stats) ? stats : (stats ? [stats] : []);
  const svs = parseInt(getStatValue(sArr, 'SVS'), 10);
  if (svs > 0) return true;
  return false;
}

/**
 * Sum MINS (Type="GAME" Code="MINS" Pos="TOT") from all goalkeepers on a competitor.
 * Handles goalie changes by adding times together. Hockey periods are 20 minutes.
 */
function getElapsedSecondsFromGoalieMins(competitor) {
  const comp = competitor?.Composition;
  const athletes = comp?.Athlete;
  const arr = Array.isArray(athletes) ? athletes : (athletes ? [athletes] : []);
  let totalSec = 0;
  for (const a of arr) {
    if (!isGoalkeeper(a)) continue;
    const stats = a.StatsItems?.StatsItem;
    const sArr = Array.isArray(stats) ? stats : (stats ? [stats] : []);
    const minsVal = getGoalieMinsStat(sArr);
    if (minsVal) {
      const sec = parseMinsToSeconds(minsVal);
      if (sec != null) totalSec += sec;
    }
  }
  return totalSec > 0 ? totalSec : null;
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

  /** Compute game time from goalkeeper MINS (Type="GAME" Code="MINS" Pos="TOT") or fallback to UnitDateTime */
  const PERIOD_SEC = 20 * 60;
  const INTERMISSION_SEC = 15 * 60;
  const p1End = PERIOD_SEC;
  const p2Start = p1End + INTERMISSION_SEC;
  const p2End = p2Start + PERIOD_SEC;
  const p3Start = p2End + INTERMISSION_SEC;
  const p3End = p3Start + PERIOD_SEC;

  let elapsedSec = null;
  const goalieMinsHome = getElapsedSecondsFromGoalieMins(homeComp);
  const goalieMinsAway = getElapsedSecondsFromGoalieMins(awayComp);
  if (goalieMinsHome != null && goalieMinsAway != null) {
    elapsedSec = Math.max(goalieMinsHome, goalieMinsAway);
  } else if (goalieMinsHome != null) {
    elapsedSec = goalieMinsHome;
  } else if (goalieMinsAway != null) {
    elapsedSec = goalieMinsAway;
  }

  if (elapsedSec == null) {
    const unitDateTime = comp.ExtendedInfos?.UnitDateTime;
    const startDateStr = attr(unitDateTime, 'StartDate');
    const feedTimestampStr = body['@_BDFTimestamp'];
    if (startDateStr && feedTimestampStr) {
      const start = new Date(startDateStr);
      const feed = new Date(feedTimestampStr);
      elapsedSec = Math.max(0, Math.floor((feed - start) / 1000));
    }
  }

  const startDateStr = attr(comp.ExtendedInfos?.UnitDateTime, 'StartDate');
  const feedTimestampStr = body['@_BDFTimestamp'];
  const rawPeriod = periodInfo?.['@_Value'] || 'P1';
  const periodCode = String(rawPeriod).replace(/^EP/i, 'P');
  let timeRemainingInPeriod = null;
  let timeRemainingGame = null;
  if (elapsedSec != null) {
    if (periodCode === 'P1' && elapsedSec < p1End) {
      timeRemainingInPeriod = p1End - elapsedSec;
      timeRemainingGame = timeRemainingInPeriod + 2 * PERIOD_SEC + 2 * INTERMISSION_SEC;
    } else if (periodCode === 'P2' && elapsedSec >= p2Start && elapsedSec < p2End) {
      timeRemainingInPeriod = p2End - elapsedSec;
      timeRemainingGame = timeRemainingInPeriod + PERIOD_SEC + INTERMISSION_SEC;
    } else if (periodCode === 'P3' && elapsedSec >= p3Start && elapsedSec < p3End) {
      timeRemainingInPeriod = p3End - elapsedSec;
      timeRemainingGame = timeRemainingInPeriod;
    } else if (/^OT$/i.test(periodCode) || elapsedSec >= p3End) {
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

/**
 * Parse a DT_RESULT XML for a FULL boxscore: per-player stats, goalie stats,
 * team per-period stats, officials, venue/attendance — everything needed for
 * the game detail page.
 */
function parseDTResultXmlFull(xmlStr) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xmlStr);
  const body = doc?.OdfBody;
  if (!body) throw new Error('Invalid OdfBody structure');

  const comp = body.Competition;
  if (!comp) throw new Error('Missing Competition');

  const a = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const extInfosObj = comp.ExtendedInfos || {};
  const sportDesc = extInfosObj.SportDescription || {};
  const venueDesc = extInfosObj.VenueDescription || {};
  const extInfoArr = Array.isArray(extInfosObj.ExtendedInfo) ? extInfosObj.ExtendedInfo : (extInfosObj.ExtendedInfo ? [extInfosObj.ExtendedInfo] : []);
  const periodInfo = extInfoArr.find(e => a(e, 'Code') === 'PERIOD');

  const periods = comp.Periods;
  const periodList = Array.isArray(periods?.Period) ? periods.Period : (periods?.Period ? [periods.Period] : []);

  const results = comp.Result;
  const resultList = Array.isArray(results) ? results : (results ? [results] : []);
  const competitors = resultList.flatMap(r => Array.isArray(r.Competitor) ? r.Competitor : (r.Competitor ? [r.Competitor] : []));

  const findHomeAway = (val) => competitors.find(c => {
    const eue = c.EventUnitEntry || [];
    const entries = Array.isArray(eue) ? eue : [eue];
    return entries.some(e => a(e, 'Code') === 'HOME_AWAY' && a(e, 'Value') === val);
  });
  const homeComp = findHomeAway('HOME');
  const awayComp = findHomeAway('AWAY');

  function getEUE(comp, code) {
    const eue = comp?.EventUnitEntry || [];
    const entries = Array.isArray(eue) ? eue : [eue];
    const e = entries.find(x => a(x, 'Code') === code);
    return e ? a(e, 'Value') : null;
  }

  function parseGameStat(statsArr, code, pos) {
    const item = statsArr.find(s => {
      const t = a(s, 'Type');
      const c = a(s, 'Code');
      const p = a(s, 'Pos');
      return (t === 'GAME') && c === code && p === pos;
    });
    if (!item) return null;
    return a(item, 'Value');
  }

  function parseGameStatObj(statsArr, code, pos) {
    const item = statsArr.find(s => {
      const t = a(s, 'Type');
      const c = a(s, 'Code');
      const p = a(s, 'Pos');
      return (t === 'GAME') && c === code && p === pos;
    });
    if (!item) return {};
    const ext = Array.isArray(item.ExtendedStat) ? item.ExtendedStat : (item.ExtendedStat ? [item.ExtendedStat] : []);
    const extObj = {};
    ext.forEach(e => { extObj[a(e, 'Code')] = a(e, 'Value'); });
    return { value: a(item, 'Value'), percent: a(item, 'Percent'), attempt: a(item, 'Attempt'), ...extObj };
  }

  function parseTeamPerPeriodStats(competitor) {
    const statsItems = competitor?.StatsItems?.StatsItem;
    const arr = Array.isArray(statsItems) ? statsItems : (statsItems ? [statsItems] : []);
    const gameStats = arr.filter(s => a(s, 'Type') === 'GAME');
    const byPeriod = {};
    for (const s of gameStats) {
      const pos = a(s, 'Pos') || 'TOT';
      const code = a(s, 'Code');
      if (!code) continue;
      if (!byPeriod[pos]) byPeriod[pos] = {};
      const entry = { value: a(s, 'Value'), percent: a(s, 'Percent'), attempt: a(s, 'Attempt') };
      const ext = Array.isArray(s.ExtendedStat) ? s.ExtendedStat : (s.ExtendedStat ? [s.ExtendedStat] : []);
      ext.forEach(e => { entry[a(e, 'Code')] = a(e, 'Value'); });
      byPeriod[pos][code] = entry;
    }
    return byPeriod;
  }

  function parseAthleteBoxscore(athlete) {
    const desc = athlete.Description || {};
    const statsItems = athlete.StatsItems?.StatsItem;
    const arr = Array.isArray(statsItems) ? statsItems : (statsItems ? [statsItems] : []);
    const eue = athlete.EventUnitEntry || [];
    const entries = Array.isArray(eue) ? eue : [eue];
    const position = entries.find(e => a(e, 'Code') === 'POSITION');
    const pos = position ? a(position, 'Value') : '';
    const isGK = pos === 'GK';

    const p = (code, period = 'TOT') => parseGameStat(arr, code, period);
    const pObj = (code, period = 'TOT') => parseGameStatObj(arr, code, period);

    const base = {
      bib: a(athlete, 'Bib') || '',
      code: a(athlete, 'Code') || '',
      givenName: a(desc, 'GivenName') || '',
      familyName: a(desc, 'FamilyName') || '',
      position: pos,
      isGoalkeeper: isGK,
    };

    if (isGK) {
      return {
        ...base,
        mins: p('MINS') || '0:00',
        svs: p('SVS'),
        svsAttempt: pObj('SVS').attempt || null,
        svsPct: pObj('SVS').percent || null,
        ga: p('GA') || '0',
        pty: p('PTY') || '0',
        pim: p('PIM') || '0',
        perPeriod: {
          P1: { svs: p('SVS', 'P1'), svsPct: pObj('SVS', 'P1').percent, svsAttempt: pObj('SVS', 'P1').attempt },
          P2: { svs: p('SVS', 'P2'), svsPct: pObj('SVS', 'P2').percent, svsAttempt: pObj('SVS', 'P2').attempt },
          P3: { svs: p('SVS', 'P3'), svsPct: pObj('SVS', 'P3').percent, svsAttempt: pObj('SVS', 'P3').attempt },
        }
      };
    }

    const foObj = pObj('FO');
    return {
      ...base,
      mins: p('MINS') || '0:00',
      gf: p('GF') || '0',
      sog: p('SOG') || '0',
      assists: p('ASSIST') || '0',
      pts: p('PTS') || '0',
      pim: p('PIM') || '0',
      pty: p('PTY') || '0',
      plusMinus: p('PLUS_MINUS') || '0',
      shifts: p('SHIFTS') || '0',
      fo: foObj.value || '0',
      foLost: foObj.LOST || '0',
      foPct: foObj.percent || null,
      perPeriod: {
        P1: { gf: p('GF', 'P1'), sog: p('SOG', 'P1'), mins: p('MINS', 'P1') },
        P2: { gf: p('GF', 'P2'), sog: p('SOG', 'P2'), mins: p('MINS', 'P2') },
        P3: { gf: p('GF', 'P3'), sog: p('SOG', 'P3'), mins: p('MINS', 'P3') },
      }
    };
  }

  function parseTeamBoxscore(competitor, sortOrder) {
    if (!competitor) return null;
    const desc = competitor.Description || {};
    const composition = competitor.Composition;
    const athletes = composition?.Athlete;
    const arr = Array.isArray(athletes) ? athletes : (athletes ? [athletes] : []);

    const goalkeepers = [];
    const players = [];
    for (const ath of arr) {
      const box = parseAthleteBoxscore(ath);
      if (box.isGoalkeeper) goalkeepers.push(box);
      else players.push(box);
    }
    players.sort((x, y) => {
      const posOrder = { D: 0, F: 1 };
      const px = posOrder[x.position] ?? 2;
      const py = posOrder[y.position] ?? 2;
      if (px !== py) return px - py;
      return parseInt(x.bib) - parseInt(y.bib);
    });

    const result = resultList.find(r => String(a(r, 'SortOrder')) === String(sortOrder)) || {};

    const coaches = competitor.Coaches?.Coach;
    const coachArr = Array.isArray(coaches) ? coaches : (coaches ? [coaches] : []);
    const coachList = coachArr.map(c => ({
      givenName: a(c.Description, 'GivenName') || '',
      familyName: a(c.Description, 'FamilyName') || '',
      function: a(c, 'Function') || ''
    }));

    return {
      code: a(competitor, 'Organisation') || '',
      name: a(desc, 'TeamName') || '',
      score: parseInt(a(result, 'Result'), 10) || 0,
      wlt: a(result, 'WLT') || '',
      uniform: getEUE(competitor, 'UNIFORM') || '',
      coaches: coachList,
      teamStats: parseTeamPerPeriodStats(competitor),
      goalkeepers,
      players,
    };
  }

  // Officials
  const officials = comp.Officials?.Official;
  const officialArr = Array.isArray(officials) ? officials : (officials ? [officials] : []);
  const officialList = officialArr.map(o => ({
    givenName: a(o.Description, 'GivenName') || '',
    familyName: a(o.Description, 'FamilyName') || '',
    organisation: a(o.Description, 'Organisation') || '',
    function: a(o, 'Function') || '',
    bib: a(o, 'Bib') || ''
  }));

  return {
    resultStatus: a(body, 'ResultStatus') || '',
    date: a(body, 'Date') || '',
    timestamp: a(body, 'BDFTimestamp') || '',
    period: periodInfo ? a(periodInfo, 'Value') : 'P1',
    discipline: a(sportDesc, 'DisciplineName') || '',
    eventName: a(sportDesc, 'EventName') || '',
    subEvent: a(sportDesc, 'SubEventName') || '',
    gender: a(sportDesc, 'Gender') || '',
    venueName: a(venueDesc, 'VenueName') || a(venueDesc, 'LocationName') || '',
    attendance: a(venueDesc, 'Attendance') || '',
    homeTeam: parseTeamBoxscore(homeComp, 1),
    awayTeam: parseTeamBoxscore(awayComp, 2),
    officials: officialList,
    periods: periodList.map(p => ({
      code: a(p, 'Code'),
      homeScore: parseInt(a(p, 'HomePeriodScore'), 10) || 0,
      awayScore: parseInt(a(p, 'AwayPeriodScore'), 10) || 0,
      homeCumulative: parseInt(a(p, 'HomeScore'), 10) || 0,
      awayCumulative: parseInt(a(p, 'AwayScore'), 10) || 0
    })),
    startDate: a(extInfosObj.UnitDateTime, 'StartDate') || null,
  };
}

/**
 * Parse DT_POOL_STANDING XML into structured pool standings data.
 */
function parseDTPoolStanding(xmlStr) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xmlStr);
  const body = doc?.OdfBody;
  if (!body) return null;

  const comp = body.Competition;
  const a = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const sportDesc = comp?.ExtendedInfos?.SportDescription || {};
  const results = comp?.Result;
  const resultList = Array.isArray(results) ? results : (results ? [results] : []);

  const standings = resultList.map(r => {
    const competitor = r.Competitor || {};
    const desc = competitor.Description || {};
    const opponents = competitor.Opponent;
    const oppArr = Array.isArray(opponents) ? opponents : (opponents ? [opponents] : []);
    const extResults = r.ExtendedResults?.ExtendedResult;
    const extArr = Array.isArray(extResults) ? extResults : (extResults ? [extResults] : []);
    const extMap = {};
    extArr.forEach(e => { extMap[a(e, 'Code')] = a(e, 'Value'); });

    return {
      rank: parseInt(a(r, 'Rank'), 10) || 0,
      teamCode: a(competitor, 'Organisation') || '',
      teamName: a(desc, 'TeamName') || '',
      played: parseInt(a(r, 'Played'), 10) || 0,
      won: parseInt(a(r, 'Won'), 10) || 0,
      lost: parseInt(a(r, 'Lost'), 10) || 0,
      otw: parseInt(extMap.OTW, 10) || 0,
      otl: parseInt(extMap.OTL, 10) || 0,
      goalsFor: parseInt(a(r, 'For'), 10) || 0,
      goalsAgainst: parseInt(a(r, 'Against'), 10) || 0,
      diff: a(r, 'Diff') || '0',
      points: parseInt(a(r, 'Result'), 10) || 0,
      sortOrder: parseInt(a(r, 'SortOrder'), 10) || 0,
      opponents: oppArr.map(o => ({
        teamCode: a(o, 'Organisation') || '',
        teamName: a(o.Description, 'TeamName') || '',
        date: a(o, 'Date') || '',
        time: a(o, 'Time') || '',
        homeAway: a(o, 'HomeAway') || '',
        result: a(o, 'Result') || '',
      })),
    };
  });

  const docCode = a(body, 'DocumentCode') || '';
  let groupCode = '';
  const gpMatch = docCode.match(/(GP[A-Z])/);
  if (gpMatch) groupCode = gpMatch[1];
  else if (docCode.includes('PREL')) groupCode = 'PREL';

  return {
    groupCode,
    subEvent: a(sportDesc, 'SubEventName') || '',
    eventName: a(sportDesc, 'EventName') || '',
    gender: a(sportDesc, 'Gender') || '',
    standings: standings.sort((x, y) => x.sortOrder - y.sortOrder),
  };
}

/**
 * Parse DT_STATS TEAM_RANKING XML into tournament team stats.
 */
function parseDTStatsTeamRanking(xmlStr) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xmlStr);
  const body = doc?.OdfBody;
  if (!body) return null;
  const comp = body.Competition;
  const a = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const stats = comp?.Stats;
  if (!stats || a(stats, 'Code') !== 'TEAM_RANKING') return null;
  const sportDesc = comp?.ExtendedInfos?.SportDescription || {};
  const competitors = Array.isArray(stats.Competitor) ? stats.Competitor : (stats.Competitor ? [stats.Competitor] : []);

  const teams = competitors.map(c => {
    const si = c.StatsItems?.StatsItem;
    const items = Array.isArray(si) ? si : (si ? [si] : []);
    const s = {};
    for (const item of items) {
      const code = a(item, 'Code');
      if (!code) continue;
      const ext = Array.isArray(item.ExtendedStat) ? item.ExtendedStat : (item.ExtendedStat ? [item.ExtendedStat] : []);
      const extObj = {};
      ext.forEach(e => { extObj[a(e, 'Code')] = a(e, 'Value'); });
      s[code] = {
        value: a(item, 'Value'), attempt: a(item, 'Attempt'), percent: a(item, 'Percent'),
        avg: a(item, 'Avg'), rank: parseInt(a(item, 'Rank'), 10) || null,
        sortOrder: parseInt(a(item, 'SortOrder'), 10) || null, ...extObj
      };
    }
    return {
      teamCode: a(c, 'Organisation') || '',
      teamName: a(c.Description, 'TeamName') || '',
      order: parseInt(a(c, 'Order'), 10) || 0,
      stats: s,
    };
  });

  return { gender: a(sportDesc, 'Gender') || '', teams };
}

/**
 * Parse DT_STATS IND_RANKING XML into tournament individual player stats.
 */
function parseDTStatsIndRanking(xmlStr) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xmlStr);
  const body = doc?.OdfBody;
  if (!body) return null;
  const comp = body.Competition;
  const a = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const stats = comp?.Stats;
  if (!stats || a(stats, 'Code') !== 'IND_RANKING') return null;
  const sportDesc = comp?.ExtendedInfos?.SportDescription || {};
  const competitors = Array.isArray(stats.Competitor) ? stats.Competitor : (stats.Competitor ? [stats.Competitor] : []);

  const players = [];
  for (const c of competitors) {
    const teamCode = a(c, 'Organisation') || '';
    const athletes = c.Composition?.Athlete;
    const arr = Array.isArray(athletes) ? athletes : (athletes ? [athletes] : []);
    for (const ath of arr) {
      const desc = ath.Description || {};
      const si = ath.StatsItems?.StatsItem;
      const items = Array.isArray(si) ? si : (si ? [si] : []);
      const s = {};
      for (const item of items) {
        const code = a(item, 'Code');
        if (!code) continue;
        const ext = Array.isArray(item.ExtendedStat) ? item.ExtendedStat : (item.ExtendedStat ? [item.ExtendedStat] : []);
        const extObj = {};
        ext.forEach(e => { extObj[a(e, 'Code')] = a(e, 'Value'); });
        s[code] = {
          value: a(item, 'Value'), attempt: a(item, 'Attempt'), percent: a(item, 'Percent'),
          avg: a(item, 'Avg'), rank: parseInt(a(item, 'Rank'), 10) || null,
          sortOrder: parseInt(a(item, 'SortOrder'), 10) || null, ...extObj
        };
      }
      players.push({
        teamCode,
        givenName: a(desc, 'GivenName') || '',
        familyName: a(desc, 'FamilyName') || '',
        position: s.POS?.value || '',
        stats: s,
      });
    }
  }

  return { gender: a(sportDesc, 'Gender') || '', players };
}

/**
 * Parse DT_BRACKETS XML into structured bracket data.
 */
function parseDTBrackets(xmlStr) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xmlStr);
  const body = doc?.OdfBody;
  if (!body) return null;

  const comp = body.Competition;
  const a = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const sportDesc = comp?.ExtendedInfos?.SportDescription || {};

  const bracket = comp?.Bracket;
  if (!bracket) return null;

  const bracketItems = bracket.BracketItems;
  const itemsArr = Array.isArray(bracketItems) ? bracketItems : (bracketItems ? [bracketItems] : []);

  const rounds = itemsArr.map(bi => {
    const code = a(bi, 'Code') || '';
    const items = bi.BracketItem;
    const matchArr = Array.isArray(items) ? items : (items ? [items] : []);

    const matches = matchArr.map(m => {
      const places = m.CompetitorPlace;
      const placeArr = Array.isArray(places) ? places : (places ? [places] : []);

      const teams = placeArr.map(cp => {
        const competitor = cp.Competitor || {};
        const desc = competitor.Description || {};
        return {
          pos: parseInt(a(cp, 'Pos'), 10) || 0,
          wlt: a(cp, 'WLT') || '',
          result: a(cp, 'Result') || '',
          teamCode: a(competitor, 'Organisation') || '',
          teamName: a(desc, 'TeamName') || '',
          seed: a(cp.PreviousUnit, 'Value') || '',
        };
      });

      return {
        order: parseInt(a(m, 'Order'), 10) || 0,
        position: parseInt(a(m, 'Position'), 10) || 0,
        date: a(m, 'Date') || '',
        time: a(m, 'Time') || '',
        result: a(m, 'Result') || '',
        teams,
      };
    });

    return { code, matches: matches.sort((x, y) => x.order - y.order) };
  });

  const roundOrder = { QFNL: 0, SFNL: 1, 'BRO-': 2, FNL: 3 };
  rounds.sort((x, y) => (roundOrder[x.code] ?? 99) - (roundOrder[y.code] ?? 99));

  return {
    eventName: a(sportDesc, 'EventName') || '',
    gender: a(sportDesc, 'Gender') || '',
    rounds,
  };
}

/**
 * Find and parse DT_PLAY_BY_PLAY files for a specific IHO game.
 * Returns sorted array of actions: { period, when, action, team, score, players[], timestamp }.
 * @param {string[]} holderPaths - directories to scan
 * @param {string} homeCode - home team code
 * @param {string} awayCode - away team code
 * @param {number} maxFiles - max PBP files to read per dir (default 30)
 * @param {string} [gameCode] - game code to filter PBP filenames (e.g. "GPC-000200") to avoid reading irrelevant files
 */
function findPlayByPlayForGame(holderPaths, homeCode, awayCode, maxFiles = 30, gameCode = null) {
  const home = (homeCode || '').trim().toUpperCase();
  const away = (awayCode || '').trim().toUpperCase();
  if (!home || !away) return [];

  const pbpParser = new XMLParser({ ignoreAttributes: false });
  const pbpAttr = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const extractTeamCode = (code) => {
    if (!code) return '';
    const m = code.match(/---([A-Z]{3})/);
    return m ? m[1] : '';
  };

  // Collect all PBP files across holder paths, grouped by period suffix (e.g. "_P1_ACTION")
  // For each period, we only read the NEWEST file — it's the authoritative cumulative version.
  // Older files may contain stale data (e.g. goals that were later rescinded/corrected).
  const newestPerPeriod = new Map(); // periodSuffix -> { dir, fname }
  for (const dirPath of holderPaths) {
    if (!fs.existsSync(dirPath)) continue;
    let names;
    try { names = fs.readdirSync(dirPath); } catch { continue; }
    let pbpFiles = names.filter(f => f.includes('DT_PLAY_BY_PLAY'));
    if (gameCode) pbpFiles = pbpFiles.filter(f => f.includes(gameCode));
    pbpFiles.sort((a, b) => b.localeCompare(a)); // newest first
    for (const fname of pbpFiles) {
      // Extract period suffix like "_P1_ACTION" or "_P2_ACTION"
      const pm = fname.match(/_P(\d+)_ACTION/i);
      const periodKey = pm ? pm[0] : '_DEFAULT';
      if (!newestPerPeriod.has(periodKey)) {
        newestPerPeriod.set(periodKey, { dir: dirPath, fname });
      }
    }
  }

  const allActions = new Map();
  for (const [, { dir, fname }] of newestPerPeriod) {
    try {
      const filePath = path.join(dir, fname);
      const xml = fs.readFileSync(filePath, 'utf-8');
      const parsed = pbpParser.parse(xml);
      const body = parsed?.OdfBody;
      if (!body) continue;
      const comp = body.Competition;
      if (!comp?.Actions) continue;
      const actions = comp.Actions;
      const fileHome = extractTeamCode(pbpAttr(actions, 'Home'));
      const fileAway = extractTeamCode(pbpAttr(actions, 'Away'));
      if (!((fileHome === home && fileAway === away) || (fileHome === away && fileAway === home))) continue;

      const actionList = Array.isArray(actions.Action) ? actions.Action : (actions.Action ? [actions.Action] : []);
      for (const a of actionList) {
        const id = pbpAttr(a, 'Id');
        if (id == null) continue;
        const order = parseInt(pbpAttr(a, 'Order'), 10) || 0;
        const existing = allActions.get(id);
        if (existing && order < existing._order) continue;

        const competitor = a.Competitor;
        const compOrg = competitor ? (pbpAttr(competitor, 'Organisation') || extractTeamCode(pbpAttr(competitor, 'Code'))) : '';
        const players = [];
        const composition = competitor?.Composition;
        const athletes = Array.isArray(composition?.Athlete) ? composition.Athlete : (composition?.Athlete ? [composition.Athlete] : []);
        for (const ath of athletes) {
          const desc = ath.Description;
          if (!desc) continue;
          const given = pbpAttr(desc, 'GivenName') || '';
          const family = pbpAttr(desc, 'FamilyName') || '';
          players.push({
            name: `${given} ${family}`.trim(),
            role: pbpAttr(ath, 'Role') || '',
            bib: pbpAttr(ath, 'Bib') || ''
          });
        }

        allActions.set(id, {
          _order: order,
          period: pbpAttr(a, 'Period') || '',
          when: pbpAttr(a, 'When') || '',
          action: pbpAttr(a, 'Action') || '',
          team: compOrg,
          scoreH: pbpAttr(a, 'ScoreH') ?? null,
          scoreA: pbpAttr(a, 'ScoreA') ?? null,
          result: pbpAttr(a, 'Result') || '',
          comment: pbpAttr(a, 'Comment') || '',
          timestamp: pbpAttr(a, 'TimeStamp') || '',
          players
        });
      }
    } catch {
      // skip unreadable
    }
  }

  const periodOrder = (p) => {
    if (!p) return 99;
    if (/^P(\d)$/i.test(p)) return parseInt(p.slice(1), 10);
    if (/^OT/i.test(p)) return 4;
    if (/^SO/i.test(p)) return 5;
    return 99;
  };
  const clockToSec = (w) => {
    if (!w) return 0;
    const parts = w.split(':');
    return parts.length === 2 ? parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) : 0;
  };

  return [...allActions.values()]
    .map(({ _order, ...rest }) => rest)
    .sort((a, b) => {
      const pd = periodOrder(a.period) - periodOrder(b.period);
      return pd !== 0 ? pd : clockToSec(a.when) - clockToSec(b.when);
    });
}

/**
 * Parse Curling DT_RESULT XML and return normalized payload.
 */
function parseDTResultXmlCurling(xmlStr) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xmlStr);
  const body = doc?.OdfBody;
  if (!body) throw new Error('Invalid OdfBody structure');

  const comp = body.Competition;
  if (!comp) throw new Error('Missing Competition');

  const attr = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const extInfos = comp.ExtendedInfos;
  const extInfo = Array.isArray(extInfos?.ExtendedInfo) ? extInfos.ExtendedInfo : (extInfos?.ExtendedInfo ? [extInfos.ExtendedInfo] : []);
  const periodInfo = extInfo.find(e => e['@_Code'] === 'PERIOD');
  const sportDesc = extInfos?.SportDescription || comp.SportDescription || {};
  const venueDesc = extInfos?.VenueDescription || comp.VenueDescription || {};

  const results = comp.Result;
  const resultList = Array.isArray(results) ? results : (results ? [results] : []);
  const homeResult = resultList.find(r => {
    const c = r.Competitor;
    const eue = c?.EventUnitEntry;
    const entries = Array.isArray(eue) ? eue : (eue ? [eue] : []);
    return entries.some(e => (e['@_Code'] ?? e.Code) === 'HOME_AWAY' && (e['@_Value'] ?? e.Value) === 'HOME');
  });
  const awayResult = resultList.find(r => {
    const c = r.Competitor;
    const eue = c?.EventUnitEntry;
    const entries = Array.isArray(eue) ? eue : (eue ? [eue] : []);
    return entries.some(e => (e['@_Code'] ?? e.Code) === 'HOME_AWAY' && (e['@_Value'] ?? e.Value) === 'AWAY');
  });

  const toTeam = (r) => {
    if (!r) return null;
    const c = r.Competitor;
    const desc = c?.Description || {};
    const stats = c?.StatsItems?.StatsItem;
    const statsArr = Array.isArray(stats) ? stats : (stats ? [stats] : []);
    const rawCode = (c?.['@_Organisation'] ?? '').toUpperCase();
    return {
      name: desc['@_TeamName'] ?? desc.TeamName ?? '',
      code: rawCode === 'PRC' ? 'CHN' : rawCode,
      score: parseInt(r['@_Result'], 10) ?? 0,
      gameSuccess: getStatValue(statsArr, 'GAME_SUCCESS'),
      gameSuccessPercent: (() => { const item = statsArr.find(s => (s['@_Code'] ?? s.Code) === 'GAME_SUCCESS'); return item?.['@_Percent']; })(),
      cw: getStatValue(statsArr, 'CW'),
      ccw: getStatValue(statsArr, 'CCW'),
      draw: getStatValue(statsArr, 'DRAW'),
      takeout: getStatValue(statsArr, 'TAKEOUT'),
      stolenEnds: getStatValue(statsArr, 'STOLENENDS'),
      stolenPoints: getStatValue(statsArr, 'STOLENPOINTS')
    };
  };

  const homeTeam = toTeam(homeResult);
  const awayTeam = toTeam(awayResult);

  const periods = comp.Periods;
  const periodList = Array.isArray(periods?.Period) ? periods.Period : (periods?.Period ? [periods.Period] : []);
  const resultStatus = body['@_ResultStatus'] || '';
  const isOfficial = resultStatus === 'OFFICIAL';

  const currentPeriodCode = isOfficial
    ? (periodList.length > 0 ? String(periodList[periodList.length - 1]['@_Code'] ?? periodList[periodList.length - 1].Code) : '1')
    : (periodInfo?.['@_Value'] || '1');
  const currentPeriod = periodList.find(p => String(p['@_Code'] ?? p.Code) === String(currentPeriodCode));

  let timeRemainingInPeriod = null;
  if (!isOfficial && currentPeriod?.ExtendedPeriods) {
    const extPeriods = currentPeriod.ExtendedPeriods;
    const epList = Array.isArray(extPeriods?.ExtendedPeriod) ? extPeriods.ExtendedPeriod : (extPeriods?.ExtendedPeriod ? [extPeriods.ExtendedPeriod] : []);
    const homeRemain = epList.find(ep => (ep['@_Code'] ?? ep.Code) === 'HOME_REMAIN');
    const awayRemain = epList.find(ep => (ep['@_Code'] ?? ep.Code) === 'AWAY_REMAIN');
    const homeSec = homeRemain ? parseMinsToSeconds(String(homeRemain['@_Value'] ?? homeRemain.Value ?? '')) : null;
    const awaySec = awayRemain ? parseMinsToSeconds(String(awayRemain['@_Value'] ?? awayRemain.Value ?? '')) : null;
    if (homeSec != null && awaySec != null) {
      timeRemainingInPeriod = Math.min(homeSec, awaySec);
    } else if (homeSec != null) {
      timeRemainingInPeriod = homeSec;
    } else if (awaySec != null) {
      timeRemainingInPeriod = awaySec;
    }
  }

  return {
    sport: 'CUR',
    resultStatus,
    date: body['@_Date'] || '',
    timestamp: body['@_BDFTimestamp'] || '',
    period: currentPeriodCode,
    discipline: attr(sportDesc, 'DisciplineName') || '',
    eventName: attr(sportDesc, 'EventName') || '',
    subEvent: attr(sportDesc, 'SubEventName') || '',
    venueName: attr(venueDesc, 'VenueName') ?? attr(venueDesc, 'LocationName') ?? '',
    homeTeam,
    awayTeam,
    timeRemainingInPeriod: timeRemainingInPeriod != null ? timeRemainingInPeriod : null,
    periods: periodList.map(p => {
      const extPeriods = p.ExtendedPeriods;
      const epList = Array.isArray(extPeriods?.ExtendedPeriod) ? extPeriods.ExtendedPeriod : (extPeriods?.ExtendedPeriod ? [extPeriods.ExtendedPeriod] : []);
      const lsce = epList.find(ep => (ep['@_Code'] ?? ep.Code) === 'LSCE');
      const homePP = epList.find(ep => (ep['@_Code'] ?? ep.Code) === 'HOME_POWERPLAY');
      const awayPP = epList.find(ep => (ep['@_Code'] ?? ep.Code) === 'AWAY_POWERPLAY');
      const lsceVal = lsce ? (lsce['@_Value'] ?? lsce.Value) : null;
      return {
        code: String(p['@_Code'] ?? p.Code),
        homeScore: parseInt(attr(p, 'HomeScore'), 10) ?? parseInt(attr(p, 'HomePeriodScore'), 10) ?? 0,
        awayScore: parseInt(attr(p, 'AwayScore'), 10) ?? parseInt(attr(p, 'AwayPeriodScore'), 10) ?? 0,
        homeEarned: parseInt(attr(p, 'HomePeriodScore'), 10) ?? 0,
        awayEarned: parseInt(attr(p, 'AwayPeriodScore'), 10) ?? 0,
        hammer: lsceVal === '1' ? 'home' : lsceVal === '2' ? 'away' : null,
        powerPlay: (homePP && (homePP['@_Value'] ?? homePP.Value) === 'Y') ? 'home' : (awayPP && (awayPP['@_Value'] ?? awayPP.Value) === 'Y') ? 'away' : null
      };
    })
  };
}

/**
 * Parse Curling DT_RESULT XML into full boxscore with per-athlete stats.
 */
function parseDTResultXmlCurlingFull(xmlStr) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xmlStr);
  const body = doc?.OdfBody;
  if (!body) throw new Error('Invalid OdfBody structure');

  const comp = body.Competition;
  if (!comp) throw new Error('Missing Competition');

  const a = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const extInfos = comp.ExtendedInfos;
  const extInfo = Array.isArray(extInfos?.ExtendedInfo) ? extInfos.ExtendedInfo : (extInfos?.ExtendedInfo ? [extInfos.ExtendedInfo] : []);
  const periodInfo = extInfo.find(e => e['@_Code'] === 'PERIOD');
  const sportDesc = extInfos?.SportDescription || {};
  const venueDesc = extInfos?.VenueDescription || {};

  const results = comp.Result;
  const resultList = Array.isArray(results) ? results : (results ? [results] : []);
  const findHA = (val) => resultList.find(r => {
    const c = r.Competitor;
    const eue = c?.EventUnitEntry;
    const entries = Array.isArray(eue) ? eue : (eue ? [eue] : []);
    return entries.some(e => (e['@_Code'] ?? e.Code) === 'HOME_AWAY' && (e['@_Value'] ?? e.Value) === val);
  });
  const homeResult = findHA('HOME');
  const awayResult = findHA('AWAY');

  function parseTeam(r) {
    if (!r) return null;
    const c = r.Competitor;
    const desc = c?.Description || {};
    const teamStats = c?.StatsItems?.StatsItem;
    const teamStatsArr = Array.isArray(teamStats) ? teamStats : (teamStats ? [teamStats] : []);

    const getTeamStat = (code) => {
      const item = teamStatsArr.find(s => (s['@_Code'] ?? s.Code) === code);
      if (!item) return { value: null, percent: null };
      return { value: a(item, 'Value'), percent: a(item, 'Percent') };
    };

    const athletes = [];
    const composition = c?.Composition;
    const athArr = Array.isArray(composition?.Athlete) ? composition.Athlete : (composition?.Athlete ? [composition.Athlete] : []);
    for (const ath of athArr) {
      const adesc = ath.Description || {};
      const si = ath.StatsItems?.StatsItem;
      const items = Array.isArray(si) ? si : (si ? [si] : []);
      const eue = Array.isArray(ath.EventUnitEntry) ? ath.EventUnitEntry : (ath.EventUnitEntry ? [ath.EventUnitEntry] : []);
      const posEntry = eue.find(e => (e['@_Code'] ?? e.Code) === 'POSITION');
      const position = posEntry ? (posEntry['@_Value'] ?? posEntry.Value) : '';

      const getStat = (code) => {
        const item = items.find(s => (s['@_Code'] ?? s.Code) === code);
        if (!item) return { value: null, percent: null };
        return { value: a(item, 'Value'), percent: a(item, 'Percent') };
      };

      athletes.push({
        code: a(ath, 'Code') || '',
        givenName: a(adesc, 'GivenName') || '',
        familyName: a(adesc, 'FamilyName') || '',
        position,
        success: getStat('GAME_SUCCESS'),
        cw: getStat('CW'),
        ccw: getStat('CCW'),
        draw: getStat('DRAW'),
        takeout: getStat('TAKEOUT'),
      });
    }

    const coaches = c?.Coaches?.Coach;
    const coachArr = Array.isArray(coaches) ? coaches : (coaches ? [coaches] : []);
    const coachList = coachArr.map(co => ({
      givenName: a(co.Description, 'GivenName') || '',
      familyName: a(co.Description, 'FamilyName') || '',
      function: a(co, 'Function') || ''
    }));

    const rawCode = (a(c, 'Organisation') || '').toUpperCase();
    return {
      name: a(desc, 'TeamName') || '',
      code: rawCode === 'PRC' ? 'CHN' : rawCode,
      score: parseInt(a(r, 'Result'), 10) || 0,
      gameSuccess: getTeamStat('GAME_SUCCESS'),
      cw: getTeamStat('CW'),
      ccw: getTeamStat('CCW'),
      draw: getTeamStat('DRAW'),
      takeout: getTeamStat('TAKEOUT'),
      stolenEnds: getTeamStat('STOLENENDS').value,
      stolenPoints: getTeamStat('STOLENPOINTS').value,
      athletes,
      coaches: coachList,
    };
  }

  const homeTeam = parseTeam(homeResult);
  const awayTeam = parseTeam(awayResult);

  // Officials
  const officials = comp.Officials?.Official;
  const officialArr = Array.isArray(officials) ? officials : (officials ? [officials] : []);
  const officialList = officialArr.map(o => ({
    givenName: a(o.Description, 'GivenName') || '',
    familyName: a(o.Description, 'FamilyName') || '',
    organisation: a(o.Description, 'Organisation') || '',
    function: a(o, 'Function') || '',
  }));

  const periods = comp.Periods;
  const periodList = Array.isArray(periods?.Period) ? periods.Period : (periods?.Period ? [periods.Period] : []);
  const resultStatus = body['@_ResultStatus'] || '';
  const isOfficial = resultStatus === 'OFFICIAL';

  const currentPeriodCode = isOfficial
    ? (periodList.length > 0 ? String(periodList[periodList.length - 1]['@_Code'] ?? periodList[periodList.length - 1].Code) : '1')
    : (periodInfo?.['@_Value'] || '1');

  return {
    sport: 'CUR',
    resultStatus,
    date: body['@_Date'] || '',
    timestamp: body['@_BDFTimestamp'] || '',
    period: currentPeriodCode,
    discipline: a(sportDesc, 'DisciplineName') || '',
    eventName: a(sportDesc, 'EventName') || '',
    subEvent: a(sportDesc, 'SubEventName') || '',
    gender: a(sportDesc, 'Gender') || '',
    venueName: a(venueDesc, 'VenueName') ?? a(venueDesc, 'LocationName') ?? '',
    homeTeam,
    awayTeam,
    officials: officialList,
    periods: periodList.map(p => {
      const extPeriods = p.ExtendedPeriods;
      const epList = Array.isArray(extPeriods?.ExtendedPeriod) ? extPeriods.ExtendedPeriod : (extPeriods?.ExtendedPeriod ? [extPeriods.ExtendedPeriod] : []);
      const lsce = epList.find(ep => (ep['@_Code'] ?? ep.Code) === 'LSCE');
      const homePP = epList.find(ep => (ep['@_Code'] ?? ep.Code) === 'HOME_POWERPLAY');
      const awayPP = epList.find(ep => (ep['@_Code'] ?? ep.Code) === 'AWAY_POWERPLAY');
      const lsceVal = lsce ? (lsce['@_Value'] ?? lsce.Value) : null;
      return {
        code: String(p['@_Code'] ?? p.Code),
        homeScore: parseInt(a(p, 'HomeScore'), 10) || parseInt(a(p, 'HomePeriodScore'), 10) || 0,
        awayScore: parseInt(a(p, 'AwayScore'), 10) || parseInt(a(p, 'AwayPeriodScore'), 10) || 0,
        homeEarned: parseInt(a(p, 'HomePeriodScore'), 10) || 0,
        awayEarned: parseInt(a(p, 'AwayPeriodScore'), 10) || 0,
        hammer: lsceVal === '1' ? 'home' : lsceVal === '2' ? 'away' : null,
        powerPlay: (homePP && (homePP['@_Value'] ?? homePP.Value) === 'Y') ? 'home' : (awayPP && (awayPP['@_Value'] ?? awayPP.Value) === 'Y') ? 'away' : null
      };
    })
  };
}

/**
 * Parse Curling DT_PLAY_BY_PLAY XML into stone-by-stone actions with sheet images.
 */
function parseDTPlayByPlayCurling(xmlStr) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xmlStr);
  const body = doc?.OdfBody;
  if (!body) return null;

  const comp = body.Competition;
  if (!comp?.Actions) return null;
  const actions = comp.Actions;
  const a = (obj, key) => obj?.['@_' + key] ?? obj?.[key];

  const extractTeamCode = (code) => {
    if (!code) return '';
    const m = code.match(/---([A-Z]{3})/);
    return m ? m[1] : '';
  };
  const normCode = (c) => (c === 'PRC' ? 'CHN' : c);

  const homeCode = normCode(extractTeamCode(a(actions, 'Home')));
  const awayCode = normCode(extractTeamCode(a(actions, 'Away')));
  const sportDesc = comp?.ExtendedInfos?.SportDescription || {};
  const gender = a(sportDesc, 'Gender') || '';

  const actionList = Array.isArray(actions.Action) ? actions.Action : (actions.Action ? [actions.Action] : []);
  const parsed = actionList.map(act => {
    const ext = Array.isArray(act.ExtendedAction) ? act.ExtendedAction : (act.ExtendedAction ? [act.ExtendedAction] : []);
    const extMap = {};
    ext.forEach(e => { extMap[a(e, 'Code')] = a(e, 'Value'); });

    const competitor = act.Competitor;
    const rawCode = competitor ? (a(competitor, 'Organisation') || extractTeamCode(a(competitor, 'Code'))) : '';
    const teamCode = normCode(rawCode);
    let playerName = '';
    const composition = competitor?.Composition;
    const athletes = Array.isArray(composition?.Athlete) ? composition.Athlete : (composition?.Athlete ? [composition.Athlete] : []);
    if (athletes.length > 0) {
      const desc = athletes[0].Description || {};
      playerName = `${a(desc, 'GivenName') || ''} ${a(desc, 'FamilyName') || ''}`.trim();
    }

    const imageData = act.ImageData || null;

    return {
      id: a(act, 'Id') || '',
      end: parseInt(a(act, 'Period'), 10) || 0,
      order: parseInt(a(act, 'Order'), 10) || 0,
      stoneNum: parseInt(extMap.STONE_NUM, 10) || 0,
      task: extMap.TASK || '',
      turn: extMap.TURN || '',
      points: extMap.POINTS || '',
      team: teamCode,
      playerName,
      imageData: imageData ? `data:image/png;base64,${imageData}` : null,
    };
  });

  return { homeCode, awayCode, gender, actions: parsed };
}

/**
 * Parse Curling DT_STATS RANKING XML into team and individual shot success rankings.
 */
function parseDTStatsCurlingRanking(xmlStr) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xmlStr);
  const body = doc?.OdfBody;
  if (!body) return null;
  const comp = body.Competition;
  const a = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const stats = comp?.Stats;
  if (!stats || a(stats, 'Code') !== 'RANKING') return null;
  const sportDesc = comp?.ExtendedInfos?.SportDescription || {};

  const competitors = Array.isArray(stats.Competitor) ? stats.Competitor : (stats.Competitor ? [stats.Competitor] : []);

  const teams = [];
  const players = [];

  for (const c of competitors) {
    const teamCode = a(c, 'Organisation') || '';
    const teamName = a(c.Description, 'TeamName') || '';

    // Team-level stats
    const tsi = c.StatsItems?.StatsItem;
    const tItems = Array.isArray(tsi) ? tsi : (tsi ? [tsi] : []);
    const mp = tItems.find(s => a(s, 'Code') === 'MP');
    const avgTot = tItems.find(s => a(s, 'Code') === 'AVG' && a(s, 'Pos') === 'TOT');
    const perMatch = tItems.filter(s => a(s, 'Code') === 'AVG' && a(s, 'Pos') !== 'TOT');

    teams.push({
      teamCode,
      teamName,
      matches: parseInt(a(mp, 'Value'), 10) || 0,
      avg: parseFloat(a(avgTot, 'Avg')) || 0,
      rank: parseInt(a(avgTot, 'Rank'), 10) || 0,
      sortOrder: parseInt(a(avgTot, 'SortOrder'), 10) || 0,
      perMatch: perMatch.map(s => ({ match: a(s, 'Pos'), pct: a(s, 'Percent') })),
    });

    // Individual athlete stats
    const composition = c.Composition;
    const athArr = Array.isArray(composition?.Athlete) ? composition.Athlete : (composition?.Athlete ? [composition.Athlete] : []);
    for (const ath of athArr) {
      const desc = ath.Description || {};
      const asi = ath.StatsItems?.StatsItem;
      const aItems = Array.isArray(asi) ? asi : (asi ? [asi] : []);
      const pos = aItems.find(s => a(s, 'Code') === 'POS');
      const mpA = aItems.find(s => a(s, 'Code') === 'MP');
      const avgA = aItems.find(s => a(s, 'Code') === 'AVG' && a(s, 'Pos') === 'TOT');

      players.push({
        teamCode,
        givenName: a(desc, 'GivenName') || '',
        familyName: a(desc, 'FamilyName') || '',
        position: a(pos, 'Value') || '',
        matches: parseInt(a(mpA, 'Value'), 10) || 0,
        avg: parseFloat(a(avgA, 'Avg')) || 0,
        rank: parseInt(a(avgA, 'Rank'), 10) || 0,
        sortOrder: parseInt(a(avgA, 'SortOrder'), 10) || 0,
      });
    }
  }

  teams.sort((x, y) => x.sortOrder - y.sortOrder);
  players.sort((x, y) => x.sortOrder - y.sortOrder);

  return { gender: a(sportDesc, 'Gender') || '', teams, players };
}

/**
 * Find curling PBP files across holder paths for a specific game (by home/away codes).
 * Files are per-end ({endNum}_ACTION.xml). We take the newest file per end, then
 * aggregate all ends. Checks team codes from the XML header (first 2KB) before loading
 * the full file to avoid parsing megabytes of base64 images.
 */
function findCurlingPlayByPlay(holderPaths, homeCode, awayCode) {
  const home = (homeCode || '').trim().toUpperCase();
  const away = (awayCode || '').trim().toUpperCase();
  if (!home || !away) return null;

  const extractTeamCode = (code) => {
    if (!code) return '';
    const m = code.match(/---([A-Z]{3})/);
    return m ? m[1] : '';
  };
  const normalizeTeamCode = (code) => (code === 'PRC' ? 'CHN' : code);
  const searchHome = normalizeTeamCode(home);
  const searchAway = normalizeTeamCode(away);

  // Collect the newest file per end across all holder paths
  const newestPerEnd = new Map();
  for (const dirPath of holderPaths) {
    if (!fs.existsSync(dirPath)) continue;
    let names;
    try { names = fs.readdirSync(dirPath); } catch { continue; }
    const pbpFiles = names
      .filter(f => f.includes('DT_PLAY_BY_PLAY_CUR') && f.endsWith('_ACTION.xml'))
      .sort((a, b) => b.localeCompare(a));
    for (const fname of pbpFiles) {
      const endMatch = fname.match(/_(\d+)_ACTION\.xml$/);
      const endKey = endMatch ? endMatch[1] : 'ALL';
      if (newestPerEnd.has(endKey)) continue;
      const filePath = path.join(dirPath, fname);
      try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(2048);
        fs.readSync(fd, buf, 0, 2048, 0);
        fs.closeSync(fd);
        const header = buf.toString('utf-8');
        const homeMatch = header.match(/Home="([^"]+)"/);
        const awayMatch = header.match(/Away="([^"]+)"/);
        const fileHome = normalizeTeamCode(homeMatch ? extractTeamCode(homeMatch[1]) : '');
        const fileAway = normalizeTeamCode(awayMatch ? extractTeamCode(awayMatch[1]) : '');
        if (!((fileHome === searchHome && fileAway === searchAway) || (fileHome === searchAway && fileAway === searchHome))) continue;
        newestPerEnd.set(endKey, filePath);
      } catch { continue; }
    }
  }

  if (newestPerEnd.size === 0) return null;

  // Each per-end file only contains that end's actions — aggregate all ends
  const sorted = [...newestPerEnd.entries()].sort((a, b) => {
    const na = parseInt(a[0], 10) || 0, nb = parseInt(b[0], 10) || 0;
    return na - nb;
  });

  let combined = null;
  for (const [, filePath] of sorted) {
    try {
      const xml = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseDTPlayByPlayCurling(xml);
      if (!parsed || !parsed.actions || parsed.actions.length === 0) continue;
      if (!combined) {
        combined = parsed;
      } else {
        combined.actions.push(...parsed.actions);
      }
    } catch { continue; }
  }
  return combined;
}

async function fetchIHOFromSupabase(home, away) {
  if (!supabase || !home || !away) return null;
  const h = home.trim().toUpperCase();
  const a = away.trim().toUpperCase();
  const { data: d1 } = await supabase.from('iho_game_data').select('data, last_updated').eq('home_team_code', h).eq('away_team_code', a).order('last_updated', { ascending: false }).limit(1);
  const { data: d2 } = await supabase.from('iho_game_data').select('data, last_updated').eq('home_team_code', a).eq('away_team_code', h).order('last_updated', { ascending: false }).limit(1);
  const row = (d1 && d1.length > 0) ? d1[0] : (d2 && d2.length > 0) ? d2[0] : null;
  if (!row) return null;
  const data = row.data;
  data.lastUpdated = row.last_updated || new Date().toISOString();
  return data;
}

async function fetchCURFromSupabase(home, away) {
  if (!supabase || !home || !away) return null;
  const h = home.trim().toUpperCase();
  const a = away.trim().toUpperCase();
  const { data: d1 } = await supabase.from('cur_game_data').select('data, last_updated').eq('home_team_code', h).eq('away_team_code', a).order('last_updated', { ascending: false }).limit(1);
  const { data: d2 } = await supabase.from('cur_game_data').select('data, last_updated').eq('home_team_code', a).eq('away_team_code', h).order('last_updated', { ascending: false }).limit(1);
  const row = (d1 && d1.length > 0) ? d1[0] : (d2 && d2.length > 0) ? d2[0] : null;
  if (!row) return null;
  const data = row.data;
  data.lastUpdated = row.last_updated || new Date().toISOString();
  return data;
}

// ============================================
// Hockey Game Detail (Full Boxscore + PBP + Pool + Brackets)
// ============================================
let _gameDetailCache = {};
const GAME_DETAIL_CACHE_TTL = 30 * 1000;

// Meta cache: pool standings, brackets, tournament stats only change when a game completes.
// Keyed by gender. Invalidated when resultStatus transitions to OFFICIAL or a new game starts.
const _ihoMetaCache = {
  gender: null,          // 'M' or 'W'
  lastGameKey: null,     // "HOME-AWAY-DATE" of the game we last saw
  lastStatus: null,      // last seen resultStatus
  poolStandings: null,
  poolStanding: null,
  brackets: null,
  tournamentStats: null,
};

function getIhoMetaCached(gender, home, away, date, resultStatus) {
  const gameKey = `${home}-${away}-${date}`;
  const statusChanged = _ihoMetaCache.lastStatus === 'OFFICIAL' && resultStatus !== 'OFFICIAL';
  const gameChanged = _ihoMetaCache.lastGameKey !== gameKey;
  const genderChanged = _ihoMetaCache.gender !== gender;
  const wasOfficial = resultStatus === 'OFFICIAL' && _ihoMetaCache.lastStatus !== 'OFFICIAL';
  const needsRefresh = !_ihoMetaCache.poolStandings || genderChanged || gameChanged || wasOfficial || statusChanged;

  // Update tracking state
  _ihoMetaCache.gender = gender;
  _ihoMetaCache.lastGameKey = gameKey;
  _ihoMetaCache.lastStatus = resultStatus;

  if (needsRefresh) return null; // caller must re-parse and call setIhoMetaCache
  return {
    poolStandings: _ihoMetaCache.poolStandings,
    poolStanding: _ihoMetaCache.poolStanding,
    brackets: _ihoMetaCache.brackets,
    tournamentStats: _ihoMetaCache.tournamentStats,
  };
}

function setIhoMetaCache(poolStandings, poolStanding, brackets, tournamentStats) {
  _ihoMetaCache.poolStandings = poolStandings;
  _ihoMetaCache.poolStanding = poolStanding;
  _ihoMetaCache.brackets = brackets;
  _ihoMetaCache.tournamentStats = tournamentStats;
}

app.get('/api/iho-game-detail', async (req, res) => {
  try {
    const home = (req.query.home || '').trim().toUpperCase();
    const away = (req.query.away || '').trim().toUpperCase();
    if (!home || !away) {
      return res.status(400).json({ error: 'home and away query params required' });
    }

    // DB-only mode (deployed)
    if (wantsDbOnly(req)) {
      if (!supabase) return res.status(404).json({ error: 'No database' });
      const { data: rows, error } = await supabase
        .from('iho_game_detail')
        .select('data')
        .or(`and(home_team_code.eq.${home},away_team_code.eq.${away}),and(home_team_code.eq.${away},away_team_code.eq.${home})`)
        .order('last_updated', { ascending: false })
        .limit(1);
      if (error) throw error;
      if (rows?.length > 0) return res.json(rows[0].data);
      return res.status(404).json({ error: 'Game not found in database' });
    }

    // Optional date parameter: scan that specific date folder
    const dateParam = (req.query.date || '').trim();

    // Cache check
    const cacheKey = `${home}-${away}-${dateParam || 'latest'}`;
    const cached = _gameDetailCache[cacheKey];
    if (cached && Date.now() < cached.expires) {
      return res.json(cached.payload);
    }

    // 1. Find the DT_RESULT file for this game
    // If date specified, scan all hour folders for that date; otherwise use wide latest-date scan
    let holderPaths;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      holderPaths = resolveHolderPathsForDate(IHO_BASE_PATH, dateParam);
    } else {
      holderPaths = resolveIHOHolderPathsWide();
    }
    let fullBoxscore = null;
    let gameCode = null;
    for (const p of holderPaths) {
      const fileResult = findDTResultFile(p, home, away);
      if (fileResult) {
        const xmlStr = fs.readFileSync(fileResult.path, 'utf-8');
        fullBoxscore = parseDTResultXmlFull(xmlStr);
        const gcMatch = path.basename(fileResult.path).match(/(GP[A-Z]-\d{6})/);
        if (gcMatch) gameCode = gcMatch[1];
        break;
      }
    }

    if (!fullBoxscore) {
      // Try DB fallback
      if (supabase) {
        const { data: rows } = await supabase
          .from('iho_game_detail')
          .select('data')
          .or(`and(home_team_code.eq.${home},away_team_code.eq.${away}),and(home_team_code.eq.${away},away_team_code.eq.${home})`)
          .order('last_updated', { ascending: false })
          .limit(1);
        if (rows?.length > 0) return res.json(rows[0].data);
      }
      return res.status(404).json({ error: 'Game not found' });
    }

    // 2. Play-by-play
    let playByPlay = [];
    try {
      const pbpPaths = dateParam ? resolveHolderPathsForDate(IHO_BASE_PATH, dateParam) : resolveIHOHolderPathsWide();
      playByPlay = findPlayByPlayForGame(pbpPaths, home, away, 30, gameCode);
    } catch (_) {}

    // Pool standings, brackets, tournament stats — use meta cache when possible
    // These only change when a game finishes (resultStatus → OFFICIAL) or a new game starts
    const metaCached = getIhoMetaCached(fullBoxscore.gender, home, away, fullBoxscore.date, fullBoxscore.resultStatus);
    let poolStandings, poolStanding, brackets, tournamentStats;

    if (metaCached) {
      poolStandings = metaCached.poolStandings;
      poolStanding = metaCached.poolStanding;
      brackets = metaCached.brackets;
      tournamentStats = metaCached.tournamentStats;
      console.log('   [IHO meta] Using cached pool/brackets/stats');
    } else {
      console.log('   [IHO meta] Re-parsing pool/brackets/stats (status=' + fullBoxscore.resultStatus + ')');
      // For pool/brackets, search latest date + game date + recent prior dates
      const latestPaths = resolveIHOHolderPathsWide();
      const gameDatePaths = dateParam ? resolveHolderPathsForDate(IHO_BASE_PATH, dateParam, 24) : [];
      const recentDatePaths = resolveRecentDatePaths(IHO_BASE_PATH, 10);
      const metaPaths = [...new Set([...latestPaths, ...gameDatePaths, ...recentDatePaths])];

      // Pool standings — collect ALL groups (GPA, GPB, GPC, PREL) for same gender
      const poolStandingsMap = {};
      try {
        for (const p of metaPaths) {
          let files;
          try { files = fs.readdirSync(p).filter(f => f.includes('DT_POOL_STANDING')).sort((x, y) => y.localeCompare(x)); } catch { continue; }
          for (const f of files) {
            const xml = fs.readFileSync(path.join(p, f), 'utf-8');
            const parsed = parseDTPoolStanding(xml);
            if (parsed && parsed.gender === fullBoxscore.gender) {
              const key = parsed.groupCode || 'UNKNOWN';
              if (!poolStandingsMap[key]) poolStandingsMap[key] = parsed;
            }
          }
        }
      } catch (_) {}
      poolStandings = Object.values(poolStandingsMap).sort((a, b) => {
        const order = { GPA: 1, GPB: 2, GPC: 3, GPD: 4, PREL: 99 };
        return (order[a.groupCode] || 50) - (order[b.groupCode] || 50);
      });

      // Brackets — find DT_BRACKETS for the same event/gender
      brackets = null;
      try {
        for (const p of metaPaths) {
          const files = fs.readdirSync(p)
            .filter(f => f.includes('DT_BRACKETS'))
            .sort((x, y) => y.localeCompare(x));
          for (const f of files) {
            const xml = fs.readFileSync(path.join(p, f), 'utf-8');
            const parsed = parseDTBrackets(xml);
            if (parsed && parsed.gender === fullBoxscore.gender) {
              brackets = parsed;
              break;
            }
          }
          if (brackets) break;
        }
      } catch (_) {}

      poolStanding = poolStandings.find(ps => ps.standings.some(s => s.teamCode === home || s.teamCode === away)) || poolStandings[0] || null;

      // Tournament stats (TEAM_RANKING + IND_RANKING)
      tournamentStats = null;
      try {
        let teamRanking = null, indRanking = null;
        for (const p of metaPaths) {
          let files;
          try { files = fs.readdirSync(p); } catch { continue; }
          if (!teamRanking) {
            const trFiles = files.filter(f => f.includes('TEAM_RANKING')).sort((x, y) => y.localeCompare(x));
            for (const f of trFiles) {
              const parsed = parseDTStatsTeamRanking(fs.readFileSync(path.join(p, f), 'utf-8'));
              if (parsed && parsed.gender === fullBoxscore.gender) { teamRanking = parsed; break; }
            }
          }
          if (!indRanking) {
            const irFiles = files.filter(f => f.includes('IND_RANKING')).sort((x, y) => y.localeCompare(x));
            for (const f of irFiles) {
              const parsed = parseDTStatsIndRanking(fs.readFileSync(path.join(p, f), 'utf-8'));
              if (parsed && parsed.gender === fullBoxscore.gender) { indRanking = parsed; break; }
            }
          }
          if (teamRanking && indRanking) break;
        }
        if (teamRanking || indRanking) {
          tournamentStats = { teamRanking: teamRanking?.teams || [], indRanking: indRanking?.players || [] };
        }
      } catch (_) {}

      // Store in cache for next request
      setIhoMetaCache(poolStandings, poolStanding, brackets, tournamentStats);
    }

    const payload = {
      ...fullBoxscore,
      playByPlay,
      poolStanding,
      poolStandings,
      brackets,
      tournamentStats,
    };

    _gameDetailCache[cacheKey] = { payload, expires: Date.now() + GAME_DETAIL_CACHE_TTL };

    // Sync to Supabase (non-blocking)
    if (supabase && fullBoxscore.homeTeam && fullBoxscore.awayTeam) {
      supabase.from('iho_game_detail').upsert({
        home_team_code: fullBoxscore.homeTeam.code,
        away_team_code: fullBoxscore.awayTeam.code,
        game_date: fullBoxscore.date || new Date().toISOString().slice(0, 10),
        data: payload,
        last_updated: new Date().toISOString()
      }, { onConflict: 'home_team_code,away_team_code,game_date' }).then(({ error }) => {
        if (error) console.error('IHO game detail sync error:', error.message);
      });
    }

    return res.json(payload);
  } catch (err) {
    console.error('IHO game detail error:', err);
    res.status(500).json({ error: 'Failed to load game detail', details: err.message });
  }
});

app.get('/api/iho-live', async (req, res) => {
  try {
    const home = req.query.home;
    const away = req.query.away;
    if (wantsDbOnly(req)) {
      const supabaseData = await fetchIHOFromSupabase(home, away);
      if (supabaseData) return res.json(supabaseData);
      return res.status(404).json({ error: 'No IHO game data found', details: 'Database only (source=db)' });
    }
    const holderPaths = resolveIHOHolderPaths();
    const hasAnyFiles = holderPaths.some(p => hasAnyDTResultInDir(p));
    if (holderPaths.length > 0 && !hasAnyFiles) {
      const supabaseData = await fetchIHOFromSupabase(home, away);
      if (supabaseData) return res.json(supabaseData);
      return res.status(404).json({
        error: 'No DT_RESULT file found',
        details: 'No files in holder path; no game data in database'
      });
    } else {
      let fileResult = null;
      for (const holderPath of holderPaths) {
        fileResult = findDTResultFile(holderPath, home, away);
        if (fileResult) break;
      }
      if (fileResult) {
        const { mtime, data } = fileResult;
        data.lastUpdated = mtime.toISOString();

        // Attach play-by-play actions if available
        // Use parsed team codes if query params not supplied
        const pbpHome = home || data.homeTeam?.code;
        const pbpAway = away || data.awayTeam?.code;
        // Extract game code from DT_RESULT filename (e.g. "GPC-000200") to filter PBP files
        const resultFileName = path.basename(fileResult.path);
        const gameCodeMatch = resultFileName.match(/(GP[A-Z]-\d{6})/);
        const gameCode = gameCodeMatch ? gameCodeMatch[1] : null;
        try {
          // Use wide holder paths (5 hours) for PBP — games span multiple hour folders
          // Game code filter ensures we only read files for this specific game
          const pbpPaths = resolveIHOHolderPathsWide();
          const pbp = findPlayByPlayForGame(pbpPaths, pbpHome, pbpAway, 30, gameCode);
          if (pbp.length > 0) data.playByPlay = pbp;
        } catch (pbpErr) {
          console.error('Play-by-play parse error:', pbpErr.message);
        }

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
        return;
      }
    }
    const supabaseData = await fetchIHOFromSupabase(home, away);
    if (supabaseData) {
      return res.json(supabaseData);
    }
    res.status(404).json({
      error: 'No DT_RESULT file found',
      details: holderPaths.length > 0 ? `Searched in: ${holderPaths.join(', ')}` : `Base path: ${IHO_BASE_PATH}`
    });
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
// Curling Game Detail (Full Boxscore + PBP + Pool + Brackets + Stats)
// ============================================
let _curGameDetailCache = {};
const CUR_GAME_DETAIL_CACHE_TTL = 30 * 1000;
const _syncedPbpImages = new Set();
let _pendingPbpImages = [];

const _curMetaCache = {
  gender: null,
  lastGameKey: null,
  lastStatus: null,
  poolStandings: null,
  poolStanding: null,
  brackets: null,
  ranking: null,
};

function getCurMetaCached(gender, home, away, date, resultStatus) {
  const gameKey = `${home}-${away}-${date}`;
  const genderChanged = _curMetaCache.gender !== gender;
  const gameChanged = _curMetaCache.lastGameKey !== gameKey;
  const wasOfficial = resultStatus === 'OFFICIAL' && _curMetaCache.lastStatus !== 'OFFICIAL';
  const statusChanged = _curMetaCache.lastStatus === 'OFFICIAL' && resultStatus !== 'OFFICIAL';
  const needsRefresh = !_curMetaCache.poolStandings || genderChanged || gameChanged || wasOfficial || statusChanged;

  _curMetaCache.gender = gender;
  _curMetaCache.lastGameKey = gameKey;
  _curMetaCache.lastStatus = resultStatus;

  if (needsRefresh) return null;
  return {
    poolStandings: _curMetaCache.poolStandings,
    poolStanding: _curMetaCache.poolStanding,
    brackets: _curMetaCache.brackets,
    ranking: _curMetaCache.ranking,
  };
}

function setCurMetaCache(poolStandings, poolStanding, brackets, ranking) {
  _curMetaCache.poolStandings = poolStandings;
  _curMetaCache.poolStanding = poolStanding;
  _curMetaCache.brackets = brackets;
  _curMetaCache.ranking = ranking;
}

function collectCurMetaData(gender, home, away, metaPaths) {
  // Pool standings
  const poolStandingsMap = {};
  try {
    for (const p of metaPaths) {
      let files;
      try { files = fs.readdirSync(p).filter(f => f.includes('DT_POOL_STANDING_CUR')).sort((x, y) => y.localeCompare(x)); } catch { continue; }
      for (const f of files) {
        const xml = fs.readFileSync(path.join(p, f), 'utf-8');
        const parsed = parseDTPoolStanding(xml);
        if (parsed && parsed.gender === gender) {
          const key = parsed.groupCode || 'PREL';
          if (!poolStandingsMap[key]) poolStandingsMap[key] = parsed;
        }
      }
    }
  } catch (_) {}
  const poolStandings = Object.values(poolStandingsMap).sort((a, b) => {
    const order = { GPA: 1, GPB: 2, GPC: 3, GPD: 4, PREL: 99 };
    return (order[a.groupCode] || 50) - (order[b.groupCode] || 50);
  });
  const poolStanding = poolStandings.find(ps => ps.standings.some(s => s.teamCode === home || s.teamCode === away)) || poolStandings[0] || null;

  // Brackets
  let brackets = null;
  try {
    for (const p of metaPaths) {
      const files = fs.readdirSync(p).filter(f => f.includes('DT_BRACKETS') && f.includes('CUR')).sort((x, y) => y.localeCompare(x));
      for (const f of files) {
        const parsed = parseDTBrackets(fs.readFileSync(path.join(p, f), 'utf-8'));
        if (parsed && parsed.gender === gender) { brackets = parsed; break; }
      }
      if (brackets) break;
    }
  } catch (_) {}

  // Ranking stats
  let ranking = null;
  try {
    for (const p of metaPaths) {
      let files;
      try { files = fs.readdirSync(p).filter(f => f.includes('DT_STATS_CUR') && f.includes('RANKING')).sort((x, y) => y.localeCompare(x)); } catch { continue; }
      for (const f of files) {
        const parsed = parseDTStatsCurlingRanking(fs.readFileSync(path.join(p, f), 'utf-8'));
        if (parsed && parsed.gender === gender) { ranking = parsed; break; }
      }
      if (ranking) break;
    }
  } catch (_) {}

  return { poolStandings, poolStanding, brackets, ranking };
}

app.get('/api/cur-game-detail', async (req, res) => {
  try {
    const home = (req.query.home || '').trim().toUpperCase();
    const away = (req.query.away || '').trim().toUpperCase();
    const dateParam = req.query.date || '';

    if (!home || !away) return res.status(400).json({ error: 'home and away query params required' });

    const cacheKey = `CUR-${home}-${away}-${dateParam || 'latest'}`;
    const cached = _curGameDetailCache[cacheKey];
    if (cached && Date.now() < cached.expires) {
      return res.json(cached.payload);
    }

    // 1. Full boxscore
    const holderPaths = dateParam
      ? resolveHolderPathsForDate(CUR_BASE_PATH, dateParam, 24)
      : resolveCURHolderPaths();

    let fullBoxscore = null;
    for (const p of holderPaths) {
      const fileResult = findDTResultFileCurling(p, home, away);
      if (fileResult) {
        const xmlStr = fs.readFileSync(fileResult.path, 'utf-8');
        fullBoxscore = parseDTResultXmlCurlingFull(xmlStr);
        break;
      }
    }

    if (!fullBoxscore) {
      // Try Supabase fallback
      if (supabase) {
        const h = home, aw = away;
        const { data: rows } = await supabase.from('cur_game_detail')
          .select('data')
          .or(`and(home_team_code.eq.${h},away_team_code.eq.${aw}),and(home_team_code.eq.${aw},away_team_code.eq.${h})`)
          .order('last_updated', { ascending: false })
          .limit(1);
        if (rows?.length > 0) return res.json(rows[0].data);
      }
      return res.status(404).json({ error: 'Game not found' });
    }

    // 2. Play-by-play (scan more hours since curling games last 3+ hours)
    let playByPlay = null;
    try {
      const pbpPaths = dateParam
        ? resolveHolderPathsForDate(CUR_BASE_PATH, dateParam, 24)
        : resolveHolderPaths(CUR_BASE_PATH, 6);
      playByPlay = findCurlingPlayByPlay(pbpPaths, home, away);
    } catch (_) {}

    // 3. Pool standings, brackets, ranking — use meta cache
    const metaCached = getCurMetaCached(fullBoxscore.gender, home, away, fullBoxscore.date, fullBoxscore.resultStatus);
    let poolStandings, poolStanding, brackets, ranking;

    if (metaCached) {
      poolStandings = metaCached.poolStandings;
      poolStanding = metaCached.poolStanding;
      brackets = metaCached.brackets;
      ranking = metaCached.ranking;
      console.log('   [CUR meta] Using cached pool/brackets/ranking');
    } else {
      console.log('   [CUR meta] Re-parsing pool/brackets/ranking (status=' + fullBoxscore.resultStatus + ')');
      const latestPaths = resolveCURHolderPaths();
      const gameDatePaths = dateParam ? resolveHolderPathsForDate(CUR_BASE_PATH, dateParam, 24) : [];
      const recentDatePaths = resolveRecentDatePaths(CUR_BASE_PATH, 10);
      const metaPaths = [...new Set([...latestPaths, ...gameDatePaths, ...recentDatePaths])];
      const meta = collectCurMetaData(fullBoxscore.gender, home, away, metaPaths);
      poolStandings = meta.poolStandings;
      poolStanding = meta.poolStanding;
      brackets = meta.brackets;
      ranking = meta.ranking;
      setCurMetaCache(poolStandings, poolStanding, brackets, ranking);
    }

    const payload = {
      ...fullBoxscore,
      playByPlay,
      poolStanding,
      poolStandings,
      brackets,
      ranking,
    };

    _curGameDetailCache[cacheKey] = { payload, expires: Date.now() + CUR_GAME_DETAIL_CACHE_TTL };

    // Sync to Supabase (non-blocking)
    if (supabase && fullBoxscore.homeTeam && fullBoxscore.awayTeam) {
      supabase.from('cur_game_detail').upsert({
        home_team_code: fullBoxscore.homeTeam.code,
        away_team_code: fullBoxscore.awayTeam.code,
        game_date: fullBoxscore.date || new Date().toISOString().slice(0, 10),
        data: payload,
        last_updated: new Date().toISOString()
      }, { onConflict: 'home_team_code,away_team_code,game_date' }).then(({ error }) => {
        if (error) console.error('CUR game detail sync error:', error.message);
      });
    }

    res.json(payload);
  } catch (err) {
    console.error('CUR game detail error:', err);
    res.status(500).json({ error: 'Failed to load curling game detail', details: err.message });
  }
});

app.get('/api/cur-live', async (req, res) => {
  try {
    const home = req.query.home;
    const away = req.query.away;
    if (wantsDbOnly(req)) {
      const supabaseData = await fetchCURFromSupabase(home, away);
      if (supabaseData) return res.json(supabaseData);
      return res.status(404).json({ error: 'No Curling game data found', details: 'Database only (source=db)' });
    }
    const holderPaths = resolveCURHolderPaths();
    if (holderPaths.length > 0 && !hasAnyDTResultInDir(holderPaths[0])) {
      const supabaseData = await fetchCURFromSupabase(home, away);
      if (supabaseData) return res.json(supabaseData);
      return res.status(404).json({
        error: 'No Curling DT_RESULT file found',
        details: 'No files in holder path; no game data in database'
      });
    }
    let fileResult = null;
    for (const holderPath of holderPaths) {
      fileResult = findDTResultFileCurling(holderPath, home, away);
      if (fileResult) break;
    }
    if (fileResult) {
      const { mtime, data } = fileResult;
      data.lastUpdated = mtime.toISOString();
      res.json(data);

      if (supabase && data.homeTeam?.code && data.awayTeam?.code && data.date) {
        supabase
          .from('cur_game_data')
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
            if (error) console.error('CUR Supabase sync error:', error.message);
          });
      }
      return;
    }
    const supabaseData = await fetchCURFromSupabase(home, away);
    if (supabaseData) {
      return res.json(supabaseData);
    }
    res.status(404).json({
      error: 'No Curling DT_RESULT file found',
      details: holderPaths.length > 0 ? `Searched in: ${holderPaths.join(', ')}` : `Base path: ${CUR_BASE_PATH}`
    });
  } catch (err) {
    console.error('CUR live error:', err);
    const status = err.message?.includes('parse') || err.message?.includes('Invalid') ? 500 : 503;
    res.status(status).json({
      error: 'Failed to load Curling live data',
      details: err.message
    });
  }
});

app.get('/api/lug-live', async (req, res) => {
  try {
    const eventCode = (req.query.event_code || req.query.eventCode || 'LUG').toString().trim().toUpperCase() || 'LUG';

    if (wantsDbOnly(req)) {
      if (supabase) {
        const { data: rows, error } = await supabase
          .from('lug_live_data')
          .select('data')
          .eq('event_code', eventCode)
          .order('last_updated', { ascending: false })
          .limit(1);
        if (!error && rows && rows.length > 0) {
          const stored = rows[0].data;
          return res.json({
            eventCode: eventCode,
            eventName: stored?.eventName,
            lastUpdated: stored?.lastUpdated,
            runs: Array.isArray(stored?.runs) ? stored.runs : []
          });
        }
        const { data: anyRows } = await supabase.from('lug_live_data').select('data').order('last_updated', { ascending: false }).limit(1);
        if (anyRows?.length > 0) {
          const stored = anyRows[0].data;
          return res.json({ eventCode, eventName: stored?.eventName, lastUpdated: stored?.lastUpdated, runs: stored?.runs || [] });
        }
      }
      return res.status(404).json({ error: 'No Luge live data found', details: 'Database only (source=db)' });
    }

    const now = Date.now();
    if (lugCache.payload && now < lugCache.expires) {
      return res.json(lugCache.payload);
    }

    if (!hasAnyLugeFiles()) {
      if (supabase) {
        const { data: rows, error } = await supabase
          .from('lug_live_data')
          .select('data')
          .eq('event_code', eventCode)
          .order('last_updated', { ascending: false })
          .limit(1);
        if (!error && rows && rows.length > 0) {
          const stored = rows[0].data;
          return res.json({
            eventCode: eventCode,
            eventName: stored?.eventName,
            lastUpdated: stored?.lastUpdated,
            runs: Array.isArray(stored?.runs) ? stored.runs : []
          });
        }
        const { data: anyRows } = await supabase.from('lug_live_data').select('data').order('last_updated', { ascending: false }).limit(1);
        if (anyRows?.length > 0) {
          const stored = anyRows[0].data;
          return res.json({ eventCode, eventName: stored?.eventName, lastUpdated: stored?.lastUpdated, runs: stored?.runs || [] });
        }
      }
      return res.status(404).json({
        error: 'No Luge DT_RESULT file found',
        details: `Base path: ${LUG_BASE_PATH}; no files; no data in database`
      });
    }

    const payload = await findAllLugeRuns();
    const code = payload.eventCode || 'LUG';
    if (payload.runs.length > 0) {
      lugCache = { payload, expires: now + LUG_CACHE_TTL_MS };
      if (supabase) {
        const row = {
          event_code: code,
          data: { eventName: payload.eventName, lastUpdated: payload.lastUpdated, runs: payload.runs },
          last_updated: payload.lastUpdated || new Date().toISOString()
        };
        supabase.from('lug_live_data').upsert(row, { onConflict: 'event_code' }).then(() => {}, () => {});
      }
      return res.json(payload);
    }
    if (supabase) {
      const { data: rows, error } = await supabase
        .from('lug_live_data')
        .select('data')
        .eq('event_code', code)
        .order('last_updated', { ascending: false })
        .limit(1);
      if (!error && rows && rows.length > 0) {
        const stored = rows[0].data;
        return res.json({
          eventCode: code,
          eventName: stored?.eventName,
          lastUpdated: stored?.lastUpdated,
          runs: Array.isArray(stored?.runs) ? stored.runs : []
        });
      }
    }
    return res.status(404).json({
      error: 'No Luge DT_RESULT file found',
      details: `Base path: ${LUG_BASE_PATH}`
    });
  } catch (err) {
    console.error('LUG live error:', err);
    const status = err.message?.includes('parse') || err.message?.includes('Invalid') ? 500 : 503;
    res.status(status).json({
      error: 'Failed to load Luge live data',
      details: err.message
    });
  }
});

app.get('/api/ssk-live', async (req, res) => {
  try {
    const eventCode = (req.query.event_code || req.query.eventCode || 'SSK').toString().trim().toUpperCase() || 'SSK';

    if (wantsDbOnly(req)) {
      if (supabase) {
        const { data: rows, error } = await supabase
          .from('ssk_live_data')
          .select('data')
          .eq('event_code', eventCode)
          .order('last_updated', { ascending: false })
          .limit(1);
        if (!error && rows && rows.length > 0) {
          const stored = rows[0].data;
          return res.json({
            eventCode: eventCode,
            eventName: stored?.eventName,
            lastUpdated: stored?.lastUpdated,
            runs: Array.isArray(stored?.runs) ? stored.runs : []
          });
        }
        const { data: anyRows } = await supabase.from('ssk_live_data').select('data').order('last_updated', { ascending: false }).limit(1);
        if (anyRows?.length > 0) {
          const stored = anyRows[0].data;
          return res.json({ eventCode, eventName: stored?.eventName, lastUpdated: stored?.lastUpdated, runs: stored?.runs || [] });
        }
      }
      return res.status(404).json({ error: 'No Speed Skating live data found', details: 'Database only (source=db)' });
    }

    const now = Date.now();
    if (sskCache.payload && now < sskCache.expires) {
      return res.json(sskCache.payload);
    }

    if (!hasAnySSKFiles()) {
      if (supabase) {
        const { data: rows, error } = await supabase
          .from('ssk_live_data')
          .select('data')
          .eq('event_code', eventCode)
          .order('last_updated', { ascending: false })
          .limit(1);
        if (!error && rows && rows.length > 0) {
          const stored = rows[0].data;
          return res.json({
            eventCode: eventCode,
            eventName: stored?.eventName,
            lastUpdated: stored?.lastUpdated,
            runs: Array.isArray(stored?.runs) ? stored.runs : []
          });
        }
        const { data: anyRows } = await supabase.from('ssk_live_data').select('data').order('last_updated', { ascending: false }).limit(1);
        if (anyRows?.length > 0) {
          const stored = anyRows[0].data;
          return res.json({ eventCode, eventName: stored?.eventName, lastUpdated: stored?.lastUpdated, runs: stored?.runs || [] });
        }
      }
      return res.status(404).json({
        error: 'No Speed Skating DT_RESULT file found',
        details: `Base path: ${SSK_BASE_PATH}; no files; no data in database`
      });
    }

    const payload = await findAllSSKRuns();
    const code = payload.eventCode || 'SSK';
    if (payload.runs.length > 0) {
      sskCache = { payload, expires: now + SSK_CACHE_TTL_MS };
      if (supabase) {
        const lastUpdated = payload.lastUpdated || new Date().toISOString();
        Promise.all((payload.runs || []).map(run => {
          const evCode = run.eventCode || code;
          return supabase.from('ssk_live_data').upsert({
            event_code: evCode,
            data: { eventName: run.subEventName || payload.eventName, lastUpdated, runs: [run] },
            last_updated: lastUpdated
          }, { onConflict: 'event_code' });
        })).then(() => {}, () => {});
      }
      return res.json(payload);
    }
    if (supabase) {
      const { data: rows, error } = await supabase
        .from('ssk_live_data')
        .select('data')
        .eq('event_code', code)
        .order('last_updated', { ascending: false })
        .limit(1);
      if (!error && rows && rows.length > 0) {
        const stored = rows[0].data;
        return res.json({
          eventCode: code,
          eventName: stored?.eventName,
          lastUpdated: stored?.lastUpdated,
          runs: Array.isArray(stored?.runs) ? stored.runs : []
        });
      }
    }
    return res.status(404).json({
      error: 'No Speed Skating DT_RESULT file found',
      details: `Base path: ${SSK_BASE_PATH}`
    });
  } catch (err) {
    console.error('SSK live error:', err);
    const status = err.message?.includes('parse') || err.message?.includes('Invalid') ? 500 : 503;
    res.status(status).json({
      error: 'Failed to load Speed Skating live data',
      details: err.message
    });
  }
});

app.get('/api/stk-live', async (req, res) => {
  try {
    const eventCode = (req.query.event_code || req.query.eventCode || 'STK').toString().trim().toUpperCase() || 'STK';

    if (wantsDbOnly(req)) {
      if (supabase) {
        const { data: rows, error } = await supabase
          .from('stk_live_data')
          .select('data')
          .eq('event_code', eventCode)
          .order('last_updated', { ascending: false })
          .limit(1);
        if (!error && rows && rows.length > 0) {
          const stored = rows[0].data;
          return res.json({
            eventCode: eventCode,
            eventName: stored?.eventName,
            lastUpdated: stored?.lastUpdated,
            runs: Array.isArray(stored?.runs) ? stored.runs : []
          });
        }
        const { data: anyRows } = await supabase.from('stk_live_data').select('data').order('last_updated', { ascending: false }).limit(1);
        if (anyRows?.length > 0) {
          const stored = anyRows[0].data;
          return res.json({ eventCode, eventName: stored?.eventName, lastUpdated: stored?.lastUpdated, runs: stored?.runs || [] });
        }
      }
      return res.status(404).json({ error: 'No Short Track Speed Skating live data found', details: 'Database only (source=db)' });
    }

    const now = Date.now();
    if (stkCache.payload && now < stkCache.expires) {
      return res.json(stkCache.payload);
    }

    if (!hasAnySTKFiles()) {
      if (supabase) {
        const { data: rows, error } = await supabase
          .from('stk_live_data')
          .select('data')
          .eq('event_code', eventCode)
          .order('last_updated', { ascending: false })
          .limit(1);
        if (!error && rows && rows.length > 0) {
          const stored = rows[0].data;
          return res.json({
            eventCode: eventCode,
            eventName: stored?.eventName,
            lastUpdated: stored?.lastUpdated,
            runs: Array.isArray(stored?.runs) ? stored.runs : []
          });
        }
        const { data: anyRows } = await supabase.from('stk_live_data').select('data').order('last_updated', { ascending: false }).limit(1);
        if (anyRows?.length > 0) {
          const stored = anyRows[0].data;
          return res.json({ eventCode, eventName: stored?.eventName, lastUpdated: stored?.lastUpdated, runs: stored?.runs || [] });
        }
      }
      return res.status(404).json({
        error: 'No Short Track Speed Skating DT_RESULT file found',
        details: `Base path: ${STK_BASE_PATH}; no files; no data in database`
      });
    }

    const payload = await findAllSTKRuns();
    const code = payload.eventCode || 'STK';
    if (payload.runs.length > 0) {
      stkCache = { payload, expires: now + STK_CACHE_TTL_MS };
      if (supabase) {
        const lastUpdated = payload.lastUpdated || new Date().toISOString();
        // Upsert the full payload as a single row (all events/phases together)
        supabase.from('stk_live_data').upsert({
          event_code: code,
          data: payload,
          last_updated: lastUpdated
        }, { onConflict: 'event_code' }).then(() => {}, () => {});
      }
      return res.json(payload);
    }
    if (supabase) {
      const { data: rows, error } = await supabase
        .from('stk_live_data')
        .select('data')
        .eq('event_code', code)
        .order('last_updated', { ascending: false })
        .limit(1);
      if (!error && rows && rows.length > 0) {
        const stored = rows[0].data;
        return res.json({
          eventCode: code,
          eventName: stored?.eventName,
          lastUpdated: stored?.lastUpdated,
          runs: Array.isArray(stored?.runs) ? stored.runs : []
        });
      }
    }
    return res.status(404).json({
      error: 'No Short Track Speed Skating DT_RESULT file found',
      details: `Base path: ${STK_BASE_PATH}`
    });
  } catch (err) {
    console.error('STK live error:', err);
    const status = err.message?.includes('parse') || err.message?.includes('Invalid') ? 500 : 503;
    res.status(status).json({
      error: 'Failed to load Short Track Speed Skating live data',
      details: err.message
    });
  }
});

app.get('/api/sbd-live', async (req, res) => {
  try {
    const eventCode = (req.query.event_code || req.query.eventCode || 'SBD').toString().trim().toUpperCase() || 'SBD';

    if (wantsDbOnly(req)) {
      if (supabase) {
        const { data: rows, error } = await supabase
          .from('sbd_live_data')
          .select('data')
          .eq('event_code', eventCode)
          .order('last_updated', { ascending: false })
          .limit(1);
        if (!error && rows && rows.length > 0) {
          return res.json(rows[0].data);
        }
        const { data: anyRows } = await supabase.from('sbd_live_data').select('data').order('last_updated', { ascending: false }).limit(1);
        if (anyRows?.length > 0) return res.json(anyRows[0].data);
      }
      return res.status(404).json({ error: 'No Snowboard live data found', details: 'Database only (source=db)' });
    }

    const now = Date.now();
    if (sbdCache.payload && now < sbdCache.expires) {
      return res.json(sbdCache.payload);
    }

    if (!hasAnySBDFiles()) {
      if (supabase) {
        const { data: rows, error } = await supabase
          .from('sbd_live_data')
          .select('data')
          .eq('event_code', eventCode)
          .order('last_updated', { ascending: false })
          .limit(1);
        if (!error && rows && rows.length > 0) return res.json(rows[0].data);
        const { data: anyRows } = await supabase.from('sbd_live_data').select('data').order('last_updated', { ascending: false }).limit(1);
        if (anyRows?.length > 0) return res.json(anyRows[0].data);
      }
      return res.status(404).json({
        error: 'No Snowboard DT_RESULT file found',
        details: `Base path: ${SBD_BASE_PATH}; no files; no data in database`
      });
    }

    const payload = await findAllSBDRuns();
    const code = payload.eventCode || 'SBD';
    if (payload.runs.length > 0 || payload.phaseResults) {
      sbdCache = { payload, expires: now + SBD_CACHE_TTL_MS };
      if (supabase) {
        const lastUpdated = payload.lastUpdated || new Date().toISOString();
        supabase.from('sbd_live_data').upsert({
          event_code: code,
          data: payload,
          last_updated: lastUpdated
        }, { onConflict: 'event_code' }).then(() => {}, () => {});
      }
      return res.json(payload);
    }
    if (supabase) {
      const { data: rows, error } = await supabase
        .from('sbd_live_data')
        .select('data')
        .eq('event_code', code)
        .order('last_updated', { ascending: false })
        .limit(1);
      if (!error && rows && rows.length > 0) return res.json(rows[0].data);
    }
    return res.status(404).json({
      error: 'No Snowboard DT_RESULT file found',
      details: `Base path: ${SBD_BASE_PATH}`
    });
  } catch (err) {
    console.error('SBD live error:', err);
    const status = err.message?.includes('parse') || err.message?.includes('Invalid') ? 500 : 503;
    res.status(status).json({
      error: 'Failed to load Snowboard live data',
      details: err.message
    });
  }
});

// ============================================
// Canadian Medal Alerts
// ============================================

/**
 * Scan all sport folders for DT_MEDALLISTS_DISCIPLINE files.
 * Returns array of Canadian medal wins for today's date.
 */
const SPORT_NAME_MAP = {
  ALP: 'Alpine Skiing', ART: 'Art', BOB: 'Bobsled', BTH: 'Biathlon',
  CCS: 'Cross-Country Skiing', CUR: 'Curling', FRS: 'Freestyle Skiing',
  FSK: 'Figure Skating', IHO: 'Ice Hockey', LUG: 'Luge', NCB: 'Nordic Combined',
  SBD: 'Snowboard', SJP: 'Ski Jumping', SKN: 'Skeleton', SMT: 'Short Track',
  SSK: 'Speed Skating', STK: 'Short Track Speed Skating', TRU: 'Trampoline'
};

// Sport codes that are NOT competition sports (never have medal files)
const SKIP_MEDAL_SCAN = new Set(['OBS', 'GEN', 'IOC', 'OLV', 'PCO', 'ART', 'CER']);

function scanCanadianMedals() {
  const INCOMING_BASE = process.env.INCOMING_BASE || 'M:\\Incoming';
  const today = new Date().toISOString().slice(0, 10); // e.g. "2026-02-12"
  const medalParser = new XMLParser({ ignoreAttributes: false });
  const mAttr = (obj, key) => obj?.['@_' + key] ?? obj?.[key];
  const medals = [];

  let sportDirs;
  try {
    sportDirs = fs.readdirSync(INCOMING_BASE, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^[A-Z]{2,4}$/.test(d.name) && !SKIP_MEDAL_SCAN.has(d.name))
      .map(d => d.name);
  } catch { return medals; }

  for (const sport of sportDirs) {
    try {
      const sportPath = path.join(INCOMING_BASE, sport);
      // Find today's date folder
      const todayPath = path.join(sportPath, today);
      if (!fs.existsSync(todayPath)) continue;

      // Get hour folders, newest first — limit to 5 newest (medal files appear in recent hours)
      let hours;
      try {
        hours = fs.readdirSync(todayPath, { withFileTypes: true })
          .filter(d => d.isDirectory() && /^\d+$/.test(d.name))
          .map(d => d.name)
          .sort((a, b) => parseInt(b, 10) - parseInt(a, 10))
          .slice(0, 5);
      } catch { continue; }

      // Find the newest DT_MEDALLISTS_DISCIPLINE file across hour folders
      let foundFile = null;
      for (const h of hours) {
        const hourPath = path.join(todayPath, h);
        let names;
        try { names = fs.readdirSync(hourPath); } catch { continue; }
        const medalFiles = names
          .filter(f => f.includes('DT_MEDALLISTS_DISCIPLINE'))
          .sort((a, b) => b.localeCompare(a)); // newest first by filename timestamp
        if (medalFiles.length > 0) {
          foundFile = path.join(hourPath, medalFiles[0]);
          break; // newest file found, no need to check older hour folders
        }
      }
      if (!foundFile) continue;

      // Parse the file
      const xml = fs.readFileSync(foundFile, 'utf-8');
      const parsed = medalParser.parse(xml);
      const body = parsed?.OdfBody;
      if (!body) continue;
      const comp = body.Competition;
      const discipline = comp?.Discipline;
      if (!discipline) continue;
      const disciplineName = mAttr(comp?.ExtendedInfos?.SportDescription, 'DisciplineName') || SPORT_NAME_MAP[sport] || sport;

      const events = Array.isArray(discipline.Event) ? discipline.Event : (discipline.Event ? [discipline.Event] : []);
      for (const ev of events) {
        const eventName = mAttr(ev, 'EventName') || '';
        const eventCode = mAttr(ev, 'Code') || '';
        const eventDate = mAttr(ev, 'Date') || '';
        // Only include medals from today
        if (eventDate !== today) continue;
        const medalNodes = Array.isArray(ev.Medal) ? ev.Medal : (ev.Medal ? [ev.Medal] : []);
        for (const m of medalNodes) {
          const medalCode = mAttr(m, 'Code') || ''; // ME_GOLD, ME_SILVER, ME_BRONZE
          const competitor = m.Competitor;
          if (!competitor) continue;
          const org = mAttr(competitor, 'Organisation') || '';
          if (org !== 'CAN') continue;

          // Extract athlete names
          const composition = competitor.Composition;
          const athletes = Array.isArray(composition?.Athlete) ? composition.Athlete : (composition?.Athlete ? [composition.Athlete] : []);
          const athleteNames = athletes.map(a => {
            const desc = a.Description;
            return {
              givenName: mAttr(desc, 'GivenName') || '',
              familyName: mAttr(desc, 'FamilyName') || ''
            };
          });

          const medalType = medalCode.replace('ME_', ''); // GOLD, SILVER, BRONZE
          const id = `${sport}-${eventCode}-${medalCode}-${eventDate}`;
          medals.push({
            id,
            sport,
            disciplineName,
            eventCode,
            eventName,
            medalType,
            athletes: athleteNames,
            eventDate
          });
        }
      }
    } catch (err) {
      console.error(`Medal scan error for ${sport}:`, err.message);
      continue;
    }
  }
  return medals;
}

// Medal cache — scan runs in background, API always serves from cache/DB instantly
let _medalCache = { data: null, ts: 0, scanning: false };
const MEDAL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Run medal scan in background thread and update cache + Supabase. */
function backgroundMedalScan() {
  if (_medalCache.scanning) return; // avoid concurrent scans
  _medalCache.scanning = true;
  try {
    const medals = scanCanadianMedals();
    _medalCache = { data: medals, ts: Date.now(), scanning: false };
    // Sync to Supabase (non-blocking)
    if (supabase && medals.length > 0) {
      for (const m of medals) {
        supabase.from('medal_alerts').upsert(
          {
            id: m.id,
            sport: m.sport,
            discipline_name: m.disciplineName,
            event_code: m.eventCode,
            event_name: m.eventName,
            medal_type: m.medalType,
            athletes: m.athletes,
            event_date: m.eventDate
          },
          { onConflict: 'id' }
        ).then(({ error }) => {
          if (error) console.error('Medal sync error:', error.message);
        });
      }
    }
    console.log(`Medal scan complete: ${medals.length} Canadian medal(s) found`);
  } catch (err) {
    _medalCache.scanning = false;
    console.error('Background medal scan error:', err.message);
  }
}

// Start medal scanning on server boot (after short delay) and repeat every 3 minutes
setTimeout(() => {
  backgroundMedalScan();
  setInterval(backgroundMedalScan, 3 * 60 * 1000);
}, 5000);

app.get('/api/medals', async (req, res) => {
  try {
    if (wantsDbOnly(req)) {
      if (!supabase) return res.json({ medals: [] });
      const today = new Date().toISOString().slice(0, 10);
      const { data: rows, error } = await supabase
        .from('medal_alerts')
        .select('*')
        .eq('event_date', today);
      if (error) throw error;
      return res.json({ medals: rows || [] });
    }

    // Serve from cache if available (background scan keeps this fresh)
    if (_medalCache.data) {
      // Trigger a re-scan if cache is stale (non-blocking)
      if ((Date.now() - _medalCache.ts) > MEDAL_CACHE_TTL) {
        setTimeout(backgroundMedalScan, 0);
      }
      return res.json({ medals: _medalCache.data });
    }

    // Cache cold — try Supabase first (fast), then trigger background scan
    if (supabase) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: rows, error } = await supabase
        .from('medal_alerts')
        .select('*')
        .eq('event_date', today);
      if (!error && rows && rows.length > 0) {
        // Seed cache from DB so subsequent requests are instant
        _medalCache = { data: rows, ts: Date.now(), scanning: _medalCache.scanning };
        setTimeout(backgroundMedalScan, 0); // refresh from files in background
        return res.json({ medals: rows });
      }
    }

    // No cache, no DB — trigger scan and return empty for now
    setTimeout(backgroundMedalScan, 0);
    return res.json({ medals: [] });
  } catch (err) {
    console.error('Medals API error:', err);
    res.status(500).json({ error: 'Failed to scan medals', details: err.message });
  }
});

/** Check which events have results in Supabase. Used to show archive icon only when data exists. */
app.post('/api/live-has-results', async (req, res) => {
  try {
    const { events } = req.body || {};
    if (!Array.isArray(events) || events.length === 0) {
      return res.json({ results: {} });
    }
    const results = {};
    if (!supabase) {
      events.forEach(e => { results[`${e.sport || ''}-${e.home || ''}-${e.away || ''}`] = false; });
      return res.json({ results });
    }
    for (const ev of events) {
      const sport = (ev.sport || '').toUpperCase();
      const h = (ev.home || '').trim().toUpperCase();
      const a = (ev.away || '').trim().toUpperCase();
      const key = `${sport}-${h}-${a}`;
      if (!h || !a || (sport !== 'IHO' && sport !== 'CUR')) {
        results[key] = false;
        continue;
      }
      const table = sport === 'CUR' ? 'cur_game_data' : 'iho_game_data';
      const { data: d1 } = await supabase.from(table).select('id').eq('home_team_code', h).eq('away_team_code', a).limit(1);
      const { data: d2 } = await supabase.from(table).select('id').eq('home_team_code', a).eq('away_team_code', h).limit(1);
      results[key] = (d1 && d1.length > 0) || (d2 && d2.length > 0);
    }
    res.json({ results });
  } catch (err) {
    console.error('live-has-results error:', err);
    res.status(500).json({ error: 'Failed to check results', details: err.message });
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
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: queuedFetch },
  });
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

/** Convert ODF unitMap to CSV-format updates object for Supabase. Keys: unit code, SessionCode (for Es Code match). */
function unitMapToUpdatesObject(unitMap) {
  if (!unitMap || unitMap.size === 0) return {};
  const out = {};
  for (const [code, unit] of unitMap) {
    const startFmt = odfDateToCsvFormat(unit.startDate);
    const endFmt = odfDateToCsvFormat(unit.endDate);
    const title = unit.constructedTitle || unit.itemName || undefined;
    const update = {
      'Es Start Time': startFmt.time || undefined,
      'Es End Time': endFmt.time || undefined,
      'Es Date': startFmt.date || undefined,
      'Title': title || undefined,
      'Es Venue': (unit.venue && typeof unit.venue === 'string') ? unit.venue : undefined
    };
    Object.keys(update).forEach(k => { if (update[k] === undefined) delete update[k]; });
    out[code] = update;
    const sc = (unit.sessionCode || '').trim();
    if (unit.videoFeeds && unit.videoFeeds.length > 0 && sc) {
      for (const vf of unit.videoFeeds) out[`${sc}:${vf}`] = update;
    } else if (sc) {
      out[sc] = update;
    }
  }
  return out;
}

/** Push ODF schedule updates (unitMap) to Supabase. Deployed API applies these over base CSV. */
async function pushScheduleUpdatesToSupabase(unitMap) {
  if (!supabase) return;
  const updates = unitMapToUpdatesObject(unitMap);
  const n = Object.keys(updates).length;
  await supabaseRetry(async () => {
    const result = await supabase
      .from('obs_schedule_updates')
      .upsert({ id: 'default', updates, last_updated: new Date().toISOString() }, { onConflict: 'id' });
    if (!result.error) console.log(`Pushed ${n} schedule update(s) to Supabase obs_schedule_updates`);
    return result;
  }, 'Push obs_schedule_updates');
}

/** Retry a Supabase operation up to `n` times with exponential backoff (2s, 6s, 14s). */
async function supabaseRetry(fn, label, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      const { error } = await fn();
      if (error) console.error(`${label}:`, error.message);
      return;
    } catch (err) {
      if (i < retries - 1) {
        const delay = 2000 * Math.pow(2, i);
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.error(`${label}:`, err.message);
      }
    }
  }
}

/** Background sync: fetch IHO and CUR live data and upsert to Supabase. Runs every 30s.
 *  All upserts are awaited to avoid overwhelming the connection pool. */
let _liveDataSyncing = false;
async function syncLiveDataToSupabase() {
  if (!supabase || _liveDataSyncing) return;
  _liveDataSyncing = true;
  try { await _syncLiveDataInner(); } finally { _liveDataSyncing = false; }
}
async function _syncLiveDataInner() {
  try {
    const holderPathsIHO = resolveIHOHolderPaths();
    let fileResult = null;
    for (const p of holderPathsIHO) {
      fileResult = findDTResultFile(p, null, null);
      if (fileResult) break;
    }
    if (fileResult) {
      const { mtime, data } = fileResult;
      data.lastUpdated = mtime.toISOString();
      if (data.homeTeam?.code && data.awayTeam?.code && data.date) {
        const hc = data.homeTeam.code, ac = data.awayTeam.code;
        const resultFileName = path.basename(fileResult.path);
        const gameCodeMatch = resultFileName.match(/(GP[A-Z]-\d{6})/);
        const gameCode = gameCodeMatch ? gameCodeMatch[1] : null;
        try {
          const pbpPaths = resolveIHOHolderPathsWide();
          const pbp = findPlayByPlayForGame(pbpPaths, hc, ac, 30, gameCode);
          if (pbp.length > 0) data.playByPlay = pbp;
        } catch (_) {}
        await supabaseRetry(
          () => supabase.from('iho_game_data').upsert(
            { home_team_code: hc, away_team_code: ac, game_date: data.date, data, last_updated: mtime.toISOString() },
            { onConflict: 'home_team_code,away_team_code,game_date' }
          ), 'IHO background sync'
        );
      }
    }
  } catch (err) {
    console.error('IHO background sync error:', err.message);
  }
  try {
    const holderPathsCUR = resolveCURHolderPaths();
    let fileResult = null;
    for (const p of holderPathsCUR) {
      fileResult = findDTResultFileCurling(p, null, null);
      if (fileResult) break;
    }
    if (fileResult) {
      const { mtime, data } = fileResult;
      data.lastUpdated = mtime.toISOString();
      if (data.homeTeam?.code && data.awayTeam?.code && data.date) {
        await supabaseRetry(
          () => supabase.from('cur_game_data').upsert(
            { home_team_code: data.homeTeam.code, away_team_code: data.awayTeam.code, game_date: data.date, data, last_updated: mtime.toISOString() },
            { onConflict: 'home_team_code,away_team_code,game_date' }
          ), 'CUR background sync'
        );
      }
    }
  } catch (err) {
    console.error('CUR background sync error:', err.message);
  }

  // --- SSK (Speed Skating) ---
  try {
    const payload = await findAllSSKRuns();
    const code = payload.eventCode || 'SSK';
    if (payload.runs.length > 0) {
      const lastUpdated = payload.lastUpdated || new Date().toISOString();
      for (const run of payload.runs) {
        const evCode = run.eventCode || code;
        await supabaseRetry(
          () => supabase.from('ssk_live_data').upsert({
            event_code: evCode,
            data: { eventName: run.subEventName || payload.eventName, lastUpdated, runs: [run] },
            last_updated: lastUpdated
          }, { onConflict: 'event_code' }), 'SSK background sync'
        );
      }
    }
  } catch (err) {
    console.error('SSK background sync error:', err.message);
  }

  // --- STK (Short Track Speed Skating) ---
  try {
    const payload = await findAllSTKRuns();
    const code = payload.eventCode || 'STK';
    if (payload.runs.length > 0) {
      const lastUpdated = payload.lastUpdated || new Date().toISOString();
      await supabaseRetry(
        () => supabase.from('stk_live_data').upsert({
          event_code: code, data: payload, last_updated: lastUpdated
        }, { onConflict: 'event_code' }), 'STK background sync'
      );
    }
  } catch (err) {
    console.error('STK background sync error:', err.message);
  }

  // --- LUG (Luge) ---
  try {
    const payload = await findAllLugeRuns();
    const code = payload.eventCode || 'LUG';
    if (payload.runs.length > 0) {
      await supabaseRetry(
        () => supabase.from('lug_live_data').upsert({
          event_code: code,
          data: { eventName: payload.eventName, lastUpdated: payload.lastUpdated, runs: payload.runs },
          last_updated: payload.lastUpdated || new Date().toISOString()
        }, { onConflict: 'event_code' }), 'LUG background sync'
      );
    }
  } catch (err) {
    console.error('LUG background sync error:', err.message);
  }

  // --- SBD (Snowboard) ---
  try {
    const payload = await findAllSBDRuns();
    const code = payload.eventCode || 'SBD';
    if (payload.runs.length > 0 || payload.phaseResults) {
      const lastUpdated = payload.lastUpdated || new Date().toISOString();
      await supabaseRetry(
        () => supabase.from('sbd_live_data').upsert({
          event_code: code, data: payload, last_updated: lastUpdated
        }, { onConflict: 'event_code' }), 'SBD background sync'
      );
    }
  } catch (err) {
    console.error('SBD background sync error:', err.message);
  }
}

/** Track games with OFFICIAL/FINAL status that synced successfully — skip on future cycles. */
const _syncedFinalGames = { iho: new Set(), cur: new Set() };

/** Background sync: IHO game detail (full boxscore + PBP + pool + brackets + tournament stats).
 *  Runs every 2 minutes so the deployed version always has fresh data. */
let _ihoDetailSyncing = false;
async function syncGameDetailToSupabase() {
  if (!supabase || _ihoDetailSyncing) return;
  _ihoDetailSyncing = true;
  try { await _syncIhoDetailInner(); } finally { _ihoDetailSyncing = false; }
}
async function _syncIhoDetailInner() {
  try {
    const holderPaths = resolveIHOHolderPathsWide();

    const matchups = new Map();
    for (const p of holderPaths) {
      const files = listDTResultFiles(p);
      if (files.length === 0) continue;
      const codeToFile = new Map();
      const sigToFile = new Map();
      for (const f of files) {
        const m = f.name.match(/(GP[A-Z]-\d{6})/);
        if (m) { if (!codeToFile.has(m[1])) codeToFile.set(m[1], f); }
        else { const sig = f.name.replace(/^\d+_\d+_/, ''); if (!sigToFile.has(sig)) sigToFile.set(sig, f); }
      }
      const uniqueFiles = [...codeToFile.values(), ...sigToFile.values()];
      for (const f of uniqueFiles) {
        try {
          const xmlStr = fs.readFileSync(f.path, 'utf-8');
          const data = parseDTResultXml(xmlStr);
          const h = data.homeTeam?.code?.toUpperCase();
          const a = data.awayTeam?.code?.toUpperCase();
          const d = data.date;
          if (!h || !a || !d) continue;
          const key = [h, a].sort().join('-') + '_' + d;
          if (!matchups.has(key)) matchups.set(key, { home: h, away: a, date: d, status: data.resultStatus });
        } catch (_) { continue; }
      }
    }

    if (matchups.size === 0) return;

    // Filter out games already synced with final status
    const toSync = [...matchups.entries()].filter(([key, m]) => {
      if (_syncedFinalGames.iho.has(key) && /OFFICIAL|FINAL/i.test(m.status || '')) return false;
      return true;
    });
    if (toSync.length === 0) return;
    console.log(`   [IHO BG sync] Found ${toSync.length} game(s) to sync (${matchups.size - toSync.length} final skipped)`);

    const recentDatePaths = resolveRecentDatePaths(IHO_BASE_PATH, 10);
    const metaPaths = [...new Set([...holderPaths, ...recentDatePaths])];

    for (const [matchKey, { home, away, date: gameDate, status }] of toSync) {
      try {
        let fullBoxscore = null;
        let gameCode = null;
        for (const p of holderPaths) {
          const fr = findDTResultFile(p, home, away);
          if (fr) {
            const xmlStr = fs.readFileSync(fr.path, 'utf-8');
            fullBoxscore = parseDTResultXmlFull(xmlStr);
            const gcMatch = path.basename(fr.path).match(/(GP[A-Z]-\d{6})/);
            if (gcMatch) gameCode = gcMatch[1];
            break;
          }
        }
        if (!fullBoxscore) continue;

        let playByPlay = [];
        try {
          playByPlay = findPlayByPlayForGame(holderPaths, home, away, 30, gameCode);
        } catch (_) {}

        const metaCached = getIhoMetaCached(fullBoxscore.gender, home, away, gameDate, fullBoxscore.resultStatus);
        let poolStandings, poolStanding, brackets, tournamentStats;

        if (metaCached) {
          poolStandings = metaCached.poolStandings;
          poolStanding = metaCached.poolStanding;
          brackets = metaCached.brackets;
          tournamentStats = metaCached.tournamentStats;
        } else {
          const poolStandingsMap = {};
          try {
            for (const p of metaPaths) {
              let files;
              try { files = fs.readdirSync(p).filter(f => f.includes('DT_POOL_STANDING')).sort((x, y) => y.localeCompare(x)); } catch { continue; }
              for (const f of files) {
                const xml = fs.readFileSync(path.join(p, f), 'utf-8');
                const parsed = parseDTPoolStanding(xml);
                if (parsed && parsed.gender === fullBoxscore.gender) {
                  const key = parsed.groupCode || 'UNKNOWN';
                  if (!poolStandingsMap[key]) poolStandingsMap[key] = parsed;
                }
              }
            }
          } catch (_) {}
          poolStandings = Object.values(poolStandingsMap).sort((a, b) => {
            const order = { GPA: 1, GPB: 2, GPC: 3, GPD: 4, PREL: 99 };
            return (order[a.groupCode] || 50) - (order[b.groupCode] || 50);
          });
          poolStanding = poolStandings.find(ps => ps.standings.some(s => s.teamCode === home || s.teamCode === away)) || poolStandings[0] || null;

          brackets = null;
          try {
            for (const p of metaPaths) {
              const files = fs.readdirSync(p).filter(f => f.includes('DT_BRACKETS')).sort((x, y) => y.localeCompare(x));
              for (const f of files) {
                const parsed = parseDTBrackets(fs.readFileSync(path.join(p, f), 'utf-8'));
                if (parsed && parsed.gender === fullBoxscore.gender) { brackets = parsed; break; }
              }
              if (brackets) break;
            }
          } catch (_) {}

          tournamentStats = null;
          try {
            let teamRanking = null, indRanking = null;
            for (const p of metaPaths) {
              let files;
              try { files = fs.readdirSync(p); } catch { continue; }
              if (!teamRanking) {
                const trFiles = files.filter(f => f.includes('TEAM_RANKING')).sort((x, y) => y.localeCompare(x));
                for (const f of trFiles) {
                  const parsed = parseDTStatsTeamRanking(fs.readFileSync(path.join(p, f), 'utf-8'));
                  if (parsed && parsed.gender === fullBoxscore.gender) { teamRanking = parsed; break; }
                }
              }
              if (!indRanking) {
                const irFiles = files.filter(f => f.includes('IND_RANKING')).sort((x, y) => y.localeCompare(x));
                for (const f of irFiles) {
                  const parsed = parseDTStatsIndRanking(fs.readFileSync(path.join(p, f), 'utf-8'));
                  if (parsed && parsed.gender === fullBoxscore.gender) { indRanking = parsed; break; }
                }
              }
              if (teamRanking && indRanking) break;
            }
            if (teamRanking || indRanking) {
              tournamentStats = { teamRanking: teamRanking?.teams || [], indRanking: indRanking?.players || [] };
            }
          } catch (_) {}

          setIhoMetaCache(poolStandings, poolStanding, brackets, tournamentStats);
        }

        // Split into two smaller upserts: base data, then PBP
        const basePayload = {
          ...fullBoxscore,
          poolStanding,
          poolStandings,
          brackets,
          tournamentStats,
        };
        const now = new Date().toISOString();
        let syncOk = false;
        await supabaseRetry(
          () => supabase.from('iho_game_detail').upsert({
            home_team_code: home, away_team_code: away, game_date: gameDate,
            data: basePayload, last_updated: now
          }, { onConflict: 'home_team_code,away_team_code,game_date' }),
          `IHO detail base (${home}-${away})`
        );
        // Second upsert merges PBP into the existing row
        if (playByPlay.length > 0) {
          await supabaseRetry(async () => {
            const { data: rows } = await supabase.from('iho_game_detail')
              .select('data').eq('home_team_code', home).eq('away_team_code', away).eq('game_date', gameDate).single();
            if (rows?.data) {
              const merged = { ...rows.data, playByPlay };
              return supabase.from('iho_game_detail').upsert({
                home_team_code: home, away_team_code: away, game_date: gameDate,
                data: merged, last_updated: now
              }, { onConflict: 'home_team_code,away_team_code,game_date' });
            }
            return { error: null };
          }, `IHO detail PBP (${home}-${away})`);
        }
        syncOk = true;

        if (syncOk && /OFFICIAL|FINAL/i.test(fullBoxscore.resultStatus || '')) {
          _syncedFinalGames.iho.add(matchKey);
        }
      } catch (err) {
        console.error(`IHO game detail sync error (${home}-${away}):`, err.message);
      }
    }
  } catch (err) {
    console.error('IHO game detail background sync error:', err.message);
  }
}

/** Background sync: CUR game detail (full boxscore + PBP + pool + brackets + ranking).
 *  Runs every 2 minutes so the deployed version always has fresh data. */
let _curDetailSyncing = false;
async function syncCurGameDetailToSupabase() {
  if (!supabase || _curDetailSyncing) return;
  _curDetailSyncing = true;
  try { await _syncCurDetailInner(); } finally { _curDetailSyncing = false; }
}
async function _syncCurDetailInner() {
  try {
    const holderPaths = resolveCURHolderPaths();

    const matchups = new Map();
    for (const p of holderPaths) {
      const files = listDTResultFiles(p);
      if (files.length === 0) continue;
      const sigToFile = new Map();
      for (const f of files) {
        const sig = f.name.replace(/^\d+_\d+_/, '');
        if (!sigToFile.has(sig)) sigToFile.set(sig, f);
      }
      for (const f of sigToFile.values()) {
        try {
          const xmlStr = fs.readFileSync(f.path, 'utf-8');
          const data = parseDTResultXmlCurling(xmlStr);
          const h = data.homeTeam?.code?.toUpperCase();
          const a = data.awayTeam?.code?.toUpperCase();
          const d = data.date;
          if (!h || !a || !d) continue;
          const key = [h, a].sort().join('-') + '_' + d;
          if (!matchups.has(key)) matchups.set(key, { home: h, away: a, date: d, status: data.resultStatus });
        } catch (_) { continue; }
      }
    }

    if (matchups.size === 0) return;

    // Filter out games already synced with final status
    const toSync = [...matchups.entries()].filter(([key, m]) => {
      if (_syncedFinalGames.cur.has(key) && /OFFICIAL|FINAL/i.test(m.status || '')) return false;
      return true;
    });
    if (toSync.length === 0) return;
    console.log(`   [CUR BG sync] Found ${toSync.length} game(s) to sync (${matchups.size - toSync.length} final skipped)`);

    const recentDatePaths = resolveRecentDatePaths(CUR_BASE_PATH, 10);
    const metaPaths = [...new Set([...holderPaths, ...recentDatePaths])];

    for (const [matchKey, { home, away, date: gameDate }] of toSync) {
      try {
        let fullBoxscore = null;
        for (const p of holderPaths) {
          const fr = findDTResultFileCurling(p, home, away);
          if (fr) {
            const xmlStr = fs.readFileSync(fr.path, 'utf-8');
            fullBoxscore = parseDTResultXmlCurlingFull(xmlStr);
            break;
          }
        }
        if (!fullBoxscore) continue;

        let playByPlay = null;
        try {
          const pbpPaths = resolveHolderPaths(CUR_BASE_PATH, 6);
          playByPlay = findCurlingPlayByPlay(pbpPaths, home, away);
        } catch (_) {}
        let pbpLite = null;
        if (playByPlay && playByPlay.actions) {
          pbpLite = { ...playByPlay, actions: playByPlay.actions.map(a => ({ ...a, imageData: null })) };

          const gameKey = `${home}-${away}_${gameDate}`;
          const newImgs = playByPlay.actions.filter(a => a.imageData && !_syncedPbpImages.has(`${gameKey}_E${a.end}_S${a.stoneNum}`));
          if (newImgs.length > 0) _pendingPbpImages.push(...newImgs.map(a => ({ gameKey, end: a.end, stoneNum: a.stoneNum, imageData: a.imageData })));
        }

        const metaCached = getCurMetaCached(fullBoxscore.gender, home, away, gameDate, fullBoxscore.resultStatus);
        let poolStandings, poolStanding, brackets, ranking;

        if (metaCached) {
          poolStandings = metaCached.poolStandings;
          poolStanding = metaCached.poolStanding;
          brackets = metaCached.brackets;
          ranking = metaCached.ranking;
        } else {
          const meta = collectCurMetaData(fullBoxscore.gender, home, away, metaPaths);
          poolStandings = meta.poolStandings;
          poolStanding = meta.poolStanding;
          brackets = meta.brackets;
          ranking = meta.ranking;
          setCurMetaCache(poolStandings, poolStanding, brackets, ranking);
        }

        // Split into two upserts: base data, then PBP (keeps each request smaller)
        const basePayload = {
          ...fullBoxscore,
          poolStanding,
          poolStandings,
          brackets,
          ranking,
        };
        const now = new Date().toISOString();
        let syncOk = false;
        await supabaseRetry(
          () => supabase.from('cur_game_detail').upsert({
            home_team_code: home, away_team_code: away, game_date: gameDate,
            data: basePayload, last_updated: now
          }, { onConflict: 'home_team_code,away_team_code,game_date' }),
          `CUR detail base (${home}-${away})`
        );
        if (pbpLite) {
          await supabaseRetry(async () => {
            const { data: rows } = await supabase.from('cur_game_detail')
              .select('data').eq('home_team_code', home).eq('away_team_code', away).eq('game_date', gameDate).single();
            if (rows?.data) {
              const merged = { ...rows.data, playByPlay: pbpLite };
              return supabase.from('cur_game_detail').upsert({
                home_team_code: home, away_team_code: away, game_date: gameDate,
                data: merged, last_updated: now
              }, { onConflict: 'home_team_code,away_team_code,game_date' });
            }
            return { error: null };
          }, `CUR detail PBP (${home}-${away})`);
        }
        syncOk = true;

        if (syncOk && /OFFICIAL|FINAL/i.test(fullBoxscore.resultStatus || '')) {
          _syncedFinalGames.cur.add(matchKey);
        }
      } catch (err) {
        console.error(`CUR game detail sync error (${home}-${away}):`, err.message);
      }
    }
  } catch (err) {
    console.error('CUR game detail background sync error:', err.message);
  }

  // Process queued PBP images one at a time with retry
  if (_pendingPbpImages.length > 0 && supabase) {
    const batch = [..._pendingPbpImages];
    _pendingPbpImages = [];
    console.log(`   [CUR PBP img] Syncing ${batch.length} new image(s)...`);
    let ok = 0;
    for (const { gameKey, end, stoneNum, imageData } of batch) {
      const imgId = `${gameKey}_E${end}_S${stoneNum}`;
      if (_syncedPbpImages.has(imgId)) { ok++; continue; }
      try {
        await supabaseRetry(async () => {
          const result = await supabase.from('cur_pbp_images').upsert({
            id: imgId, game_key: gameKey, end_num: parseInt(end) || 0, stone_num: stoneNum || 0,
            image_data: imageData, last_updated: new Date().toISOString()
          }, { onConflict: 'id' });
          if (!result.error) { _syncedPbpImages.add(imgId); ok++; }
          return result;
        }, `PBP img ${imgId}`);
      } catch (_) {}
    }
    console.log(`   [CUR PBP img] Done: ${ok}/${batch.length} synced. ${_syncedPbpImages.size} total cached.`);
  }
}

if (supabase) {
  // Pre-load existing PBP image IDs and final game keys from DB to avoid redundant uploads after restart
  (async () => {
    try {
      const { data: imgRows } = await supabase.from('cur_pbp_images').select('id');
      if (imgRows) {
        for (const r of imgRows) _syncedPbpImages.add(r.id);
        console.log(`   [startup] Loaded ${_syncedPbpImages.size} existing PBP image ID(s) from DB`);
      }
    } catch (e) { console.error('   [startup] Failed to pre-load PBP image IDs:', e.message); }
    try {
      const { data: ihoRows } = await supabase.from('iho_game_detail').select('home_team_code,away_team_code,game_date,data');
      if (ihoRows) {
        for (const r of ihoRows) {
          const st = r.data?.resultStatus || '';
          if (/OFFICIAL|FINAL/i.test(st)) {
            const key = [r.home_team_code, r.away_team_code].sort().join('-') + '_' + r.game_date;
            _syncedFinalGames.iho.add(key);
          }
        }
        console.log(`   [startup] Loaded ${_syncedFinalGames.iho.size} final IHO game(s) from DB`);
      }
    } catch (e) { console.error('   [startup] Failed to pre-load IHO final games:', e.message); }
    try {
      const { data: curRows } = await supabase.from('cur_game_detail').select('home_team_code,away_team_code,game_date,data');
      if (curRows) {
        for (const r of curRows) {
          const st = r.data?.resultStatus || '';
          if (/OFFICIAL|FINAL/i.test(st)) {
            const key = [r.home_team_code, r.away_team_code].sort().join('-') + '_' + r.game_date;
            _syncedFinalGames.cur.add(key);
          }
        }
        console.log(`   [startup] Loaded ${_syncedFinalGames.cur.size} final CUR game(s) from DB`);
      }
    } catch (e) { console.error('   [startup] Failed to pre-load CUR final games:', e.message); }
  })();

  // Stagger initial syncs to avoid overwhelming the connection pool
  setTimeout(() => syncLiveDataToSupabase(), 5000);
  setTimeout(() => syncGameDetailToSupabase(), 10000);
  setTimeout(() => syncCurGameDetailToSupabase(), 17000);
  setInterval(syncLiveDataToSupabase, 30 * 1000);
  setInterval(syncGameDetailToSupabase, 120 * 1000);
  setInterval(syncCurGameDetailToSupabase, 30 * 1000);
  console.log('   Live data background sync: every 30s (IHO + CUR + SSK + STK + LUG + SBD)');
  console.log('   IHO game detail background sync: every 2m (all active games)');
  console.log('   CUR game detail background sync: every 30s (all active games)');
  console.log('   Initial sync staggered: 5s / 10s / 17s (pre-load from DB first)');
}

// Valid resource types
const validResourceTypes = ['commentators', 'producers', 'encoders', 'booths', 'suites', 'networks', 'staff'];
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
      case 'GET': {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .order('name');
        if (error) {
          if (error.code === '42P01') {
            return res.json([]);
          }
          throw error;
        }
        res.json(data || []);
        break;
      }

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
    if (error.code === '42P01' && req.method === 'GET') {
      return res.json([]);
    }
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

// Schedule venues: GET /api/schedule-venues
app.get('/api/schedule-venues', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  try {
    const { data, error } = await supabase
      .from('schedule_venues')
      .select('id, key, label, sort_order')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    if (error.code === '42P01') {
      return res.json([]);
    }
    console.error('Error in /api/schedule-venues:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Schedule blocks: GET/POST/PUT/DELETE /api/schedule-blocks
function parseScheduleBlockBody(body) {
  const b = body || {};
  return {
    schedule_date: b.schedule_date,
    venue_id: b.venue_id,
    title: b.title != null ? String(b.title).trim() : '',
    start_time: b.start_time,
    end_time: b.end_time,
    field_crew: Boolean(b.field_crew),
    panel_tech: Boolean(b.panel_tech),
    panel_talent: Boolean(b.panel_talent),
    unicamx1: Boolean(b.unicamx1),
    unicamx2: Boolean(b.unicamx2),
    notes: b.notes != null ? String(b.notes).trim() : null,
    staff_ids: Array.isArray(b.staff_ids) ? b.staff_ids : []
  };
}

app.get('/api/schedule-blocks', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  const date = req.query.date;
  if (!date) {
    return res.status(400).json({ error: 'Query parameter date (YYYY-MM-DD) is required' });
  }
  try {
    const { data: blocks, error: blocksError } = await supabase
      .from('schedule_blocks')
      .select('*, venue:schedule_venues(id, key, label, sort_order)')
      .eq('schedule_date', date)
      .order('start_time');
    if (blocksError) throw blocksError;
    const blockIds = (blocks || []).map((b) => b.id);
    let staffLinks = [];
    if (blockIds.length > 0) {
      const { data: links, error: linksError } = await supabase
        .from('schedule_block_staff')
        .select('schedule_block_id, staff_id, staff:staff(id, name)')
        .in('schedule_block_id', blockIds);
      if (!linksError) staffLinks = links || [];
    }
    const staffByBlock = {};
    staffLinks.forEach((link) => {
      const bid = link.schedule_block_id;
      if (!staffByBlock[bid]) staffByBlock[bid] = [];
      if (link.staff && link.staff.id) {
        staffByBlock[bid].push({ id: link.staff.id, name: link.staff.name });
      }
    });
    const result = (blocks || []).map((b) => {
      const venue = b.venue || b.schedule_venues;
      return {
        ...b,
        venue_id: b.venue_id,
        venue_key: venue?.key ?? null,
        venue_label: venue?.label ?? null,
        staff: staffByBlock[b.id] || []
      };
    });
    res.json(result);
  } catch (error) {
    if (error.code === '42P01') {
      return res.json([]);
    }
    console.error('Error in GET /api/schedule-blocks:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/schedule-blocks', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  const body = parseScheduleBlockBody(req.body);
  if (!body.schedule_date || !body.venue_id || body.title === undefined) {
    return res.status(400).json({ error: 'schedule_date, venue_id, and title are required' });
  }
  if (!body.start_time || !body.end_time) {
    return res.status(400).json({ error: 'start_time and end_time are required' });
  }
  if (new Date(body.start_time) >= new Date(body.end_time)) {
    return res.status(400).json({ error: 'end_time must be after start_time' });
  }
  try {
    const { data: newBlock, error: insertError } = await supabase
      .from('schedule_blocks')
      .insert([{
        schedule_date: body.schedule_date,
        venue_id: body.venue_id,
        title: body.title,
        start_time: body.start_time,
        end_time: body.end_time,
        field_crew: body.field_crew,
        panel_tech: body.panel_tech,
        panel_talent: body.panel_talent,
        unicamx1: body.unicamx1,
        unicamx2: body.unicamx2,
        notes: body.notes || null
      }])
      .select()
      .single();
    if (insertError) throw insertError;
    if (body.staff_ids.length > 0) {
      await supabase.from('schedule_block_staff').insert(
        body.staff_ids.map((staff_id) => ({ schedule_block_id: newBlock.id, staff_id }))
      );
    }
    const venueRes = await supabase.from('schedule_venues').select('id, key, label, sort_order').eq('id', newBlock.venue_id).single();
    const { data: staffRows } = await supabase.from('schedule_block_staff').select('staff:staff(id, name)').eq('schedule_block_id', newBlock.id);
    const staff = (staffRows || []).filter((r) => r.staff && r.staff.id).map((r) => ({ id: r.staff.id, name: r.staff.name }));
    res.status(201).json({
      ...newBlock,
      venue_key: venueRes.data?.key ?? null,
      venue_label: venueRes.data?.label ?? null,
      staff
    });
  } catch (error) {
    console.error('Error in POST /api/schedule-blocks:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.put('/api/schedule-blocks', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  const id = req.body?.id;
  if (!id) {
    return res.status(400).json({ error: 'id is required' });
  }
  const body = parseScheduleBlockBody(req.body);
  if (!body.schedule_date || !body.venue_id || body.title === undefined) {
    return res.status(400).json({ error: 'schedule_date, venue_id, and title are required' });
  }
  if (!body.start_time || !body.end_time) {
    return res.status(400).json({ error: 'start_time and end_time are required' });
  }
  if (new Date(body.start_time) >= new Date(body.end_time)) {
    return res.status(400).json({ error: 'end_time must be after start_time' });
  }
  try {
    const { data: updated, error: updateError } = await supabase
      .from('schedule_blocks')
      .update({
        schedule_date: body.schedule_date,
        venue_id: body.venue_id,
        title: body.title,
        start_time: body.start_time,
        end_time: body.end_time,
        field_crew: body.field_crew,
        panel_tech: body.panel_tech,
        panel_talent: body.panel_talent,
        unicamx1: body.unicamx1,
        unicamx2: body.unicamx2,
        notes: body.notes || null
      })
      .eq('id', id)
      .select()
      .single();
    if (updateError) throw updateError;
    if (!updated) {
      return res.status(404).json({ error: 'Schedule block not found' });
    }
    await supabase.from('schedule_block_staff').delete().eq('schedule_block_id', id);
    if (body.staff_ids.length > 0) {
      await supabase.from('schedule_block_staff').insert(
        body.staff_ids.map((staff_id) => ({ schedule_block_id: id, staff_id }))
      );
    }
    const venueRes = await supabase.from('schedule_venues').select('id, key, label, sort_order').eq('id', updated.venue_id).single();
    const { data: staffRows } = await supabase.from('schedule_block_staff').select('staff:staff(id, name)').eq('schedule_block_id', id);
    const staff = (staffRows || []).filter((r) => r.staff && r.staff.id).map((r) => ({ id: r.staff.id, name: r.staff.name }));
    res.json({
      ...updated,
      venue_key: venueRes.data?.key ?? null,
      venue_label: venueRes.data?.label ?? null,
      staff
    });
  } catch (error) {
    console.error('Error in PUT /api/schedule-blocks:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.delete('/api/schedule-blocks', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  const id = req.query.id;
  if (!id) {
    return res.status(400).json({ error: 'id is required' });
  }
  try {
    const { error: deleteError } = await supabase.from('schedule_blocks').delete().eq('id', id);
    if (deleteError) throw deleteError;
    res.status(204).end();
  } catch (error) {
    console.error('Error in DELETE /api/schedule-blocks:', error);
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

// CLI: npm run schedule-sync — load CSV, run ODF merge, push updates to Supabase, exit
// CLI: npm run schedule-sync:watch — run sync, wait 1 hour, repeat (keeps running)
if (process.argv.includes('--schedule-sync')) {
  const watch = process.argv.includes('--watch');
  const doSync = async () => {
    loadStaticCSVOnStartup();
    if (eventsData.length === 0) {
      console.error('No schedule loaded. Place schedule.csv in backend/data/');
      if (!watch) process.exit(1);
      return;
    }
    const { unitMap, filesRead } = collectOdfScheduleUnits();
    const count = mergeOdfScheduleIntoEvents(eventsData, unitMap);
    if (count > 0) {
      const eventsJsonPath = path.join(__dirname, 'events.json');
      fs.writeFileSync(eventsJsonPath, JSON.stringify(eventsData, null, 2));
    }
    await pushScheduleUpdatesToSupabase(unitMap);
    const ts = new Date().toISOString();
    console.log(`[${ts}] Schedule sync complete: ${unitMap.size} ODF unit(s) from ${filesRead} file(s), ${count} event(s) updated.`);
    if (!watch) process.exit(0);
  };
  (async () => {
    await doSync();
    if (watch) {
      const intervalMs = ODF_SCHEDULE_MERGE_INTERVAL_MS;
      console.log(`Next sync in ${intervalMs / 60000} min. (Ctrl+C to stop)`);
      setInterval(doSync, intervalMs);
    }
  })();
  // Don't start server
} else {
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
  console.log('    GET /api/schedule-venues');
  console.log('    GET/POST/PUT/DELETE /api/schedule-blocks');
  }
  loadStaticCSVOnStartup();

  // ODF schedule merge: first run after 2 min, then every hour
  if (ODF_SCHEDULE_MERGE_ENABLED) {
    setTimeout(() => runOdfScheduleMerge(), ODF_SCHEDULE_FIRST_RUN_DELAY_MS);
    setInterval(runOdfScheduleMerge, ODF_SCHEDULE_MERGE_INTERVAL_MS);
    console.log(`  ODF schedule merge: enabled (first run in ${ODF_SCHEDULE_FIRST_RUN_DELAY_MS / 60000} min, then every ${ODF_SCHEDULE_MERGE_INTERVAL_MS / 60000} min)`);
  }
});
}
