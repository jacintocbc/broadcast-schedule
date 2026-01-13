import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inline getEventsData function
function getEventsData() {
  try {
    const projectRoot = path.join(__dirname, '..');
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
        // Simplified - just return empty for now, full CSV parsing is complex
        return [];
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
