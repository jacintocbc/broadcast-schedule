import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inline getEventsData function
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
