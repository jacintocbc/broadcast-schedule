import { getEventsData } from './utils.js';

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
