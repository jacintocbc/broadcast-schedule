# Vercel Deployment Guide

This guide explains how to deploy both the frontend and backend to Vercel.

## Prerequisites

1. A [Vercel account](https://vercel.com/signup)
2. The Vercel CLI installed: `npm i -g vercel`
3. Your project pushed to a Git repository (GitHub, GitLab, or Bitbucket)

## Project Structure

The project has been configured for Vercel deployment with:
- **Frontend**: React/Vite app in `frontend/` directory
- **Backend**: Serverless functions in `api/` directory
- **Configuration**: `vercel.json` at the root

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Push your code to Git**
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push
   ```

2. **Import project in Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your Git repository
   - Vercel will auto-detect the configuration

3. **Configure environment variables** (if needed)
   - In the Vercel dashboard, go to your project settings
   - Add any environment variables under "Environment Variables"
   - For this project, no environment variables are required

4. **Deploy**
   - Click "Deploy"
   - Vercel will build and deploy your application

### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI** (if not already installed)
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Link to existing project or create new
   - Confirm project settings
   - Deploy to production: `vercel --prod`

## Important Notes

### CSV File Location

The CSV file must be in the repository at `backend/data/schedule.csv`. The serverless functions will read it from there.

**Important**: Make sure your CSV file is committed to Git:
```bash
git add backend/data/schedule.csv
git commit -m "Add schedule CSV file"
git push
```

### File Size Limits

- Vercel serverless functions have a 50MB limit for the entire function bundle
- If your CSV file is very large (>10MB), consider:
  - Pre-processing the CSV and committing `events.json` instead
  - Using Vercel KV or a database for storage
  - Splitting the CSV into smaller files

### Build Configuration

The `vercel.json` file is configured to:
- Build the frontend from `frontend/` directory
- Serve static files from `frontend/dist`
- Route `/api/*` requests to serverless functions in `api/`
- Route all other requests to the React app

### API Endpoints

After deployment, your API endpoints will be available at:
- `https://your-project.vercel.app/api/events`
- `https://your-project.vercel.app/api/events/dates`
- `https://your-project.vercel.app/api/health`

The frontend will automatically use these endpoints (no configuration needed).

## Troubleshooting

### Build Fails

1. **Check build logs** in Vercel dashboard
2. **Verify dependencies** are in `package.json`:
   ```bash
   cd frontend && npm install
   ```
3. **Check Node.js version** - Vercel uses Node 18.x by default

### API Functions Not Working

1. **Check function logs** in Vercel dashboard
2. **Verify CSV file exists** at `backend/data/schedule.csv`
3. **Check file paths** - serverless functions use different paths than local development

### CORS Issues

CORS headers are already configured in the API functions. If you still see CORS errors:
- Check that the frontend URL matches your Vercel deployment URL
- Verify CORS headers in `api/*.js` files

## Alternative: Separate Deployments

If you prefer to deploy frontend and backend separately:

### Frontend Only (Vercel)
- Deploy just the `frontend/` directory
- Update API calls to point to your backend URL
- Set environment variable: `VITE_API_URL=https://your-backend-url.com`

### Backend Only (Alternative Platforms)
Consider deploying the Express backend to:
- **Railway**: Easy Express deployment
- **Render**: Free tier available
- **Fly.io**: Good for Node.js apps
- **Heroku**: Traditional option

Then deploy frontend to Vercel pointing to the backend URL.

## Post-Deployment

After successful deployment:

1. **Test the application** at your Vercel URL
2. **Check API endpoints** are responding
3. **Verify CSV data** is loading correctly
4. **Monitor function logs** for any errors

## Updating the CSV File

To update the schedule:

1. Replace `backend/data/schedule.csv` with your new file
2. Commit and push to Git
3. Vercel will automatically redeploy
4. The new data will be processed on the next API call

## Support

For Vercel-specific issues, check:
- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Community](https://github.com/vercel/vercel/discussions)
