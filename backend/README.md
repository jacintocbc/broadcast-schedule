# Broadcast Scheduler Backend

## Setup

1. **Planning table (On Air metadata):** If you use the Planning page and want On Air data in the database, run the migration in Supabase SQL editor:
   - `migrations/create_planning.sql` creates the `planning` table (block_id, producer_broadcast_start_time, producer_broadcast_end_time, notes, sort_order).

2. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

- `POST /api/upload` - Upload a CSV file
- `GET /api/events` - Get all events
- `GET /api/health` - Health check
