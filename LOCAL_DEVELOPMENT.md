# Local Development Setup

## Prerequisites

1. Node.js 18+ installed
2. Supabase project created (same one used for Vercel)

## Setup Steps

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the `backend/` directory:

```bash
cd backend
```

Create `.env` file with:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

**To get these values:**
1. Go to your Supabase Dashboard
2. Settings → API
3. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`

### 3. Start Development Servers

**Option A: Run both together (from root)**
```bash
npm run dev
```

**Option B: Run separately**

Terminal 1 (Backend):
```bash
cd backend
npm run dev
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

### 4. Verify Setup

1. Backend should start on `http://localhost:3001`
2. Frontend should start on `http://localhost:3004` (or 3000)
3. Check backend console for:
   - `✅ Supabase client initialized for database routes` (if .env is set)
   - `⚠️  Supabase not configured` (if .env is missing)

## Available Routes (Local)

### CSV/Events Routes
- `GET /api/health` - Health check
- `GET /api/events` - Get all events (from CSV)
- `GET /api/events/dates` - Get available dates
- `POST /api/upload` - Upload CSV (if needed)
- `POST /api/load-static` - Load CSV from data folder

### Database Routes (if Supabase configured)
- `GET/POST/PUT/DELETE /api/resources/:type` - Manage resources
  - Types: `commentators`, `producers`, `encoders`, `booths`, `suites`, `networks`
- `GET/POST/PUT/DELETE /api/blocks` - Manage blocks
- `GET/POST/DELETE /api/blocks/:blockId/relationships` - Manage block relationships
- `GET /api/booths/:boothId/blocks` - Get blocks for a booth

## Troubleshooting

### "Database not configured" errors
- Make sure `.env` file exists in `backend/` directory
- Verify environment variable names: `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- Restart the backend server after creating/updating `.env`

### 404 errors on `/api/resources/*`
- Make sure backend server is running on port 3001
- Check that Vite proxy is configured (it should be in `vite.config.js`)
- Verify the route exists in `backend/index.js`

### CORS errors
- Backend has CORS enabled, but if issues persist, check `backend/index.js` for CORS middleware

## Notes

- The `.env` file is gitignored (won't be committed)
- Use the same Supabase credentials as Vercel for consistency
- Local development uses Express backend, Vercel uses serverless functions
- Both should work identically once configured
