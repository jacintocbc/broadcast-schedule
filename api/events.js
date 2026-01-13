import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  
  // Determine if DST is active (simplified: March-October = CEST, otherwise CET)
  const isDST = monthNum >= 3 && monthNum <= 10;
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
    return {
      events: [],
      stats: {
        totalRows: 0,
        validCount: 0,
        invalidCount: 0
      }
    };
  }
  
  // Transform records
  let validCount = 0;
  let invalidCount = 0;
  const transformedEvents = records.map((row, index) => {
    try {
      const event = transformRow(row);
      if (event === null) {
        invalidCount++;
      } else {
        validCount++;
      }
      return event;
    } catch (error) {
      invalidCount++;
      console.error(`Error transforming row ${index + 1}:`, error.message);
      return null;
    }
  }).filter(event => event !== null);
  
  return {
    events: transformedEvents,
    stats: {
      totalRows: records.length,
      validCount,
      invalidCount
    }
  };
}

/**
 * Get events data - loads from CSV or cached JSON
 * In Vercel, files are read-only, so we can't write events.json
 */
function getEventsData() {
  try {
    // In Vercel, __dirname points to the function's directory
    // We need to go up to the project root
    const projectRoot = path.join(__dirname, '..');
    
    // Try to load from processed events.json first (faster)
    // This file should be pre-generated and committed to the repo
    const eventsJsonPath = path.join(projectRoot, 'backend', 'events.json');
    if (fs.existsSync(eventsJsonPath)) {
      try {
        const fileContent = fs.readFileSync(eventsJsonPath, 'utf-8');
        if (fileContent.trim()) {
          const events = JSON.parse(fileContent);
          if (events && events.length > 0) {
            return events;
          }
        }
      } catch (error) {
        console.error('Error reading events.json:', error);
      }
    }
    
    // Fallback: load and process CSV from the repository
    const dataDir = path.join(projectRoot, 'backend', 'data');
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.csv'));
      if (files.length > 0) {
        const filePath = path.join(dataDir, files[0]);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const result = processCSVContent(fileContent);
        
        // Note: In Vercel serverless functions, the filesystem is read-only
        // We can't write events.json, but we can return the processed events
        // For production, pre-generate events.json and commit it to the repo
        
        return result.events;
      }
    }
    
    return [];
  } catch (error) {
    console.error('Error loading events data:', error);
    return [];
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const eventsData = getEventsData();
    
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
}
