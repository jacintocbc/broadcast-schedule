# Broadcast Resource Scheduler

A local web application for viewing TV event schedules and assigning broadcast resources (Encoders, VO Booths) to events.

## Project Structure

```
olympus/
├── backend/          # Node.js/Express API server
├── frontend/         # React + Vite application
└── README.md
```

## Tech Stack

- **Backend**: Node.js with Express
- **Database**: In-memory storage (events.json) for MVP phase
- **Frontend**: React (Vite) + Tailwind CSS
- **Visualization**: Custom timeline component with CSS Grid
- **Timezone Handling**: moment-timezone for EST/Rome timezone conversions

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

The backend will run on `http://localhost:3001`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

## Usage

1. Place your CSV file in the `backend/data/` directory
2. Start both the backend and frontend servers
3. The backend will automatically load the CSV file from the `data/` directory on startup
4. Open your browser to `http://localhost:3000`
5. View the schedule on the timeline visualization

**Note:** The backend still supports the `POST /api/upload` endpoint for programmatic CSV uploads, but the frontend UI no longer includes a file uploader. CSV files should be placed in the `backend/data/` directory for automatic loading.

## CSV Format

The CSV file should contain the following columns:
- `Id` - Unique identifier
- `ChannelName` - Channel name (e.g., "DX04", "DX16")
- `Date` - Date in DD/MM/YYYY format (e.g., "01/02/2026")
- `Title` - Event title
- `Tx Start Time` - Start time in HH:MM:SS format (e.g., "12:00:00")
- `Tx End Time` - End time in HH:MM:SS format (e.g., "13:30:00")

## API Endpoints

- `POST /api/upload` - Upload and process a CSV file (programmatic use)
- `POST /api/load-static` - Manually trigger loading CSV from `backend/data/` directory
- `GET /api/events` - Retrieve all events (supports `?date=YYYY-MM-DD` query parameter for filtering)
- `GET /api/events/dates` - Get list of available dates with events
- `GET /api/health` - Health check endpoint

**Note:** The app automatically loads CSV files from `backend/data/` on startup. The upload endpoint is still available for programmatic use.

## Phase 1 (MVP)

This MVP focuses on:
- CSV ingestion and parsing
- Data transformation (date/time combination)
- Timeline visualization
- Grouping by ChannelName

Resource assignment functionality will be added in future phases.
