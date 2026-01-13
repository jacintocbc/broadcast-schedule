import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Convert DD/MM/YYYY date and HH:MM:SS time (in Rome timezone) to ISO timestamp (UTC)
 */
function combineDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) {
    throw new Error('Date and time strings are required');
  }
  
  const dateParts = dateStr.split('/');
  if (dateParts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}. Expected DD/MM/YYYY`);
  }
  const [day, month, year] = dateParts;
  
  const timeParts = timeStr.split(':');
  if (timeParts.length < 2) {
    throw new Error(`Invalid time format: ${timeStr}. Expected HH:MM:SS`);
  }
  const [hours, minutes, seconds = '00'] = timeParts;
  
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
  
  const isDST = monthNum >= 3 && monthNum <= 10;
  const romeOffsetHours = isDST ? 2 : 1;
  
  const utcDate = new Date(Date.UTC(
    yearNum,
    monthNum - 1,
    dayNum,
    hoursNum - romeOffsetHours,
    minutesNum,
    secondsNum
  ));
  
  if (isNaN(utcDate.getTime())) {
    throw new Error(`Invalid date created from: ${dateStr} ${timeStr}`);
  }
  
  return utcDate.toISOString();
}

function getColumnValue(row, possibleNames) {
  const keys = Object.keys(row);
  
  for (const name of possibleNames) {
    if (row[name] !== undefined) {
      return row[name]?.trim() || '';
    }
  }
  
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

function transformRow(row) {
  const id = getColumnValue(row, ['Id', 'ID', 'id']);
  const date = getColumnValue(row, ['Date', 'date']);
  const txStartTime = getColumnValue(row, ['Tx Start Time', 'TxStartTime', 'tx start time', 'TX Start Time']);
  const txEndTime = getColumnValue(row, ['Tx End Time', 'TxEndTime', 'tx end time', 'TX End Time']);
  
  if (!id || !date || !txStartTime || !txEndTime) {
    return null;
  }
  
  try {
    const startParts = txStartTime.split(':');
    const startHours = parseInt(startParts[0], 10);
    const startMinutes = parseInt(startParts[1] || '0', 10);
    const startSeconds = parseInt(startParts[2] || '0', 10);
    
    const normalizedStartTime = `${startHours.toString().padStart(2, '0')}:${startMinutes.toString().padStart(2, '0')}:${startSeconds.toString().padStart(2, '0')}`;
    const startTime = combineDateTime(date, normalizedStartTime);
    
    return { start_time: startTime };
  } catch (error) {
    return null;
  }
}

function processCSVContent(fileContent) {
  if (!fileContent || typeof fileContent !== 'string') {
    throw new Error('Invalid file content');
  }
  
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
        return header.map(col => {
          if (!col || typeof col !== 'string') {
            return '';
          }
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
    throw new Error(`Failed to parse CSV: ${parseError.message}`);
  }
  
  if (!records || records.length === 0) {
    return { events: [] };
  }
  
  const transformedEvents = records.map(row => transformRow(row)).filter(event => event !== null);
  
  return { events: transformedEvents };
}

function getEventsData() {
  try {
    const projectRoot = path.join(__dirname, '..', '..');
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
    
    const dataDir = path.join(projectRoot, 'backend', 'data');
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.csv'));
      if (files.length > 0) {
        const filePath = path.join(dataDir, files[0]);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const result = processCSVContent(fileContent);
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
}
