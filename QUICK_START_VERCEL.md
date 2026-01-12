# Quick Start: Deploy to Vercel

## Prerequisites
- Git repository with your code
- Vercel account (free at [vercel.com](https://vercel.com))

## Steps

### 1. Ensure CSV file is in repository
```bash
# Make sure your CSV file is committed
git add backend/data/schedule.csv
git commit -m "Add schedule data"
git push
```

### 2. Deploy to Vercel

**Option A: Via Dashboard (Easiest)**
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your Git repository
3. Click "Deploy" (Vercel auto-detects the configuration)
4. Wait for deployment to complete

**Option B: Via CLI**
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod
```

### 3. Verify Deployment
- Visit your Vercel URL (e.g., `https://your-project.vercel.app`)
- Check API endpoints:
  - `https://your-project.vercel.app/api/health`
  - `https://your-project.vercel.app/api/events/dates`

## What Was Changed

1. **Created `api/` directory** with serverless functions:
   - `api/events.js` - GET /api/events
   - `api/events/dates.js` - GET /api/events/dates
   - `api/health.js` - GET /api/health
   - `api/utils.js` - Shared utility functions

2. **Created `vercel.json`** - Deployment configuration

3. **Created `package.json`** at root - For Vercel to install dependencies

4. **Created `.vercelignore`** - Files to exclude from deployment

## Important Notes

- **CSV file must be in Git**: The CSV at `backend/data/schedule.csv` must be committed to your repository
- **No environment variables needed**: The app works without any configuration
- **Automatic deployments**: Every push to your main branch will trigger a new deployment

## Troubleshooting

**Build fails?**
- Check that `backend/data/schedule.csv` exists and is committed
- Verify Node.js version (Vercel uses 18.x by default)
- Check build logs in Vercel dashboard

**API not working?**
- Check function logs in Vercel dashboard
- Verify CSV file path is correct
- Ensure `csv-parse` dependency is available

For more details, see [DEPLOYMENT.md](./DEPLOYMENT.md)
