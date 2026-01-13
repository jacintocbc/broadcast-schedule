# Broadcast Resource Scheduler - Setup Instructions

## Prerequisites

1. A Supabase account (sign up at https://supabase.com)
2. Node.js 18+ installed
3. Vercel account (for deployment)

## Step 1: Set Up Supabase Database

1. Go to https://supabase.com and create a new project
2. Once your project is created, go to the SQL Editor
3. Copy the contents of `supabase-migration.sql` and paste it into the SQL Editor
4. Click "Run" to execute the migration
5. Verify the tables were created by checking the Table Editor

## Step 2: Get Supabase Credentials

1. In your Supabase project dashboard, go to Settings → API
2. Copy the following:
   - **Project URL** (under "Project URL")
   - **anon public key** (under "Project API keys")

## Step 3: Install Dependencies

```bash
# Install root dependencies (includes Supabase client)
npm install

# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies (if running locally)
cd ../backend
npm install
```

## Step 4: Configure Environment Variables

### For Local Development

Create a `.env` file in the root directory:

```env
SUPABASE_URL=your_project_url_here
SUPABASE_ANON_KEY=your_anon_key_here
```

### For Vercel Deployment

1. Go to your Vercel project settings
2. Navigate to Environment Variables
3. Add the following:
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_ANON_KEY` = your Supabase anon key

## Step 5: Run Locally (Optional)

```bash
# From root directory
npm run dev
```

This will start:
- Backend on http://localhost:3001
- Frontend on http://localhost:3000 (or 3004, check vite config)

## Step 6: Deploy to Vercel

1. Push your code to GitHub
2. Import the project in Vercel
3. Add the environment variables (Step 4)
4. Deploy!

## Step 7: Verify Setup

1. **Resources Page**: Navigate to the "Resources" tab and try creating a commentator, producer, encoder, booth, suite, or network
2. **Blocks Page**: Navigate to the "Blocks" tab and create a block, then assign resources to it
3. **Booth Page**: Navigate to the "Booth Page" tab, select a booth, and view its assigned blocks

## API Endpoints

### Reference Tables (CRUD)
- `GET /api/commentators` - Get all commentators
- `POST /api/commentators` - Create commentator
- `PUT /api/commentators` - Update commentator
- `DELETE /api/commentators?id={id}` - Delete commentator

Same pattern for: `producers`, `encoders`, `booths`, `suites`, `networks`

### Blocks
- `GET /api/blocks` - Get all blocks
- `GET /api/blocks?id={id}` - Get single block with relationships
- `POST /api/blocks` - Create block
- `PUT /api/blocks` - Update block
- `DELETE /api/blocks?id={id}` - Delete block

### Block Relationships
- `GET /api/blocks/{blockId}/commentators` - Get commentators for block
- `POST /api/blocks/{blockId}/commentators` - Link commentator to block
- `DELETE /api/blocks/{blockId}/commentators?linkId={id}` - Unlink commentator

Same pattern for: `booths`, `networks`

### Booth Page
- `GET /api/booths/{boothId}/blocks` - Get all blocks for a booth

## Troubleshooting

### "Missing Supabase environment variables"
- Make sure you've set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in your environment

### "Failed to fetch" errors
- Check that your Supabase project is active
- Verify the API keys are correct
- Check browser console for detailed error messages

### Database connection issues
- Ensure your Supabase project is not paused
- Check that the migration SQL ran successfully
- Verify table names match exactly (case-sensitive)

## Next Steps

1. **Live XML Data**: The schema includes a `live_event_data` table for future XML ingestion
2. **Authentication**: Consider adding authentication if you need user management
3. **Permissions**: Set up Row Level Security (RLS) policies in Supabase for production use
