# Vercel Environment Variables Setup for Real-time Features

## Issue
Real-time features work on localhost but not on the deployed Vercel instance.

## Solution

The frontend needs **client-side** environment variables with the `VITE_` prefix to access Supabase from the browser.

### Step 1: Add Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

**For Production, Preview, AND Development:**

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**Important Notes:**
- ✅ Must use `VITE_` prefix (Vite requirement for client-side variables)
- ✅ Set for all environments (Production, Preview, Development)
- ✅ Use the same values as your backend `SUPABASE_URL` and `SUPABASE_ANON_KEY`

### Step 2: Redeploy

After adding the environment variables, you **must redeploy**:

1. Go to **Deployments** tab
2. Click the **"..."** menu on the latest deployment
3. Click **"Redeploy"**

Or push a new commit to trigger a new deployment.

### Step 3: Verify

1. Open your deployed app in a browser
2. Open the browser console (F12)
3. Look for:
   - ✅ `✅ Supabase client initialized` - means env vars are set
   - ✅ `✅ Subscribed to blocks changes` - means real-time is working
   - ❌ `❌ Supabase environment variables not set` - means env vars are missing

### Common Issues

**Issue: "Supabase environment variables not set"**
- **Fix:** Make sure variables are named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (with `VITE_` prefix)
- **Fix:** Make sure they're set for the correct environment (Production/Preview/Development)
- **Fix:** Redeploy after adding variables

**Issue: "Subscribed" but no updates**
- **Fix:** Check Supabase dashboard → Settings → API → Realtime is enabled
- **Fix:** Check that the tables have Realtime enabled (Database → Replication)

**Issue: Works on localhost but not deployed**
- **Fix:** This usually means the `VITE_` prefixed variables aren't set in Vercel
- **Fix:** Make sure you redeployed after adding the variables

## Getting Your Supabase Credentials

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **API**
3. Copy:
   - **Project URL** → Use for `VITE_SUPABASE_URL`
   - **anon public key** → Use for `VITE_SUPABASE_ANON_KEY`

## Testing Real-time

1. Open your deployed app in two different browser windows (or two different computers)
2. Make a change in one window (e.g., change a booth assignment)
3. The change should appear in the other window within 1-2 seconds
4. Check the browser console for subscription status messages
