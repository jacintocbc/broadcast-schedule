import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase, testConnection } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

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
  console.log('  GET  /api/events');
  console.log('  POST /api/upload');
  console.log('  POST /api/load-static');
  loadStaticCSVOnStartup();
});

app.get('/api/test-db', async (req, res) => {
  try {
    const connected = await testConnection();
    if (connected) {
      res.json({ 
        status: 'success', 
        message: 'Connected to Supabase',
        url: process.env.SUPABASE_URL ? 'Set' : 'Missing',
        key: process.env.SUPABASE_ANON_KEY ? 'Set' : 'Missing'
      });
    } else {
      res.status(500).json({ status: 'error', message: 'Failed to connect' });
    }
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});