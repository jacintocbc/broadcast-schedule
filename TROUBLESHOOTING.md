# Troubleshooting "Failed to Fetch" Errors

## Quick Diagnostic Steps

### 1. Test Database Connection
Visit: `https://your-app.vercel.app/api/test-db`

This will show:
- If environment variables are set
- If database connection works
- Any connection errors

### 2. Test Debug Endpoint
Visit: `https://your-app.vercel.app/api/debug`

This will show:
- Request details
- Environment variable status
- Query parameters

### 3. Test Basic Endpoint
Visit: `https://your-app.vercel.app/api/health`

This should return: `{"status":"ok"}`

## Common Issues

### Issue 1: Environment Variables Not Set
**Symptoms:** All API calls fail with "Failed to fetch"

**Solution:**
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Verify these are set:
   - `SUPABASE_URL` (should start with `https://`)
   - `SUPABASE_ANON_KEY` (long string)
3. **Important:** After adding/changing env vars, you MUST redeploy
4. Go to Deployments → Click "..." on latest → "Redeploy"

### Issue 2: Supabase Project Paused
**Symptoms:** Database connection errors

**Solution:**
1. Go to Supabase Dashboard
2. Check if project shows "Paused" status
3. If paused, click "Restore" to reactivate

### Issue 3: CORS Issues
**Symptoms:** Browser console shows CORS errors

**Solution:**
1. Supabase automatically allows CORS from any origin with anon key
2. If issues persist, check Supabase project settings
3. Verify you're using the **anon** key, not service_role key

### Issue 4: Dynamic Routes Not Working
**Symptoms:** Nested routes like `/api/blocks/[id]/commentators` return 404

**Solution:**
- Vercel should handle these automatically
- Check Vercel deployment logs for route matching errors
- Verify file structure: `api/blocks/[blockId]/commentators.js`

### Issue 5: API Routes Return 404
**Symptoms:** All `/api/*` routes return 404

**Solution:**
1. Check `vercel.json` exists in root directory
2. Verify `api/` directory structure
3. Check Vercel build logs for errors
4. Ensure files are committed to git

## Step-by-Step Debugging

### Step 1: Check Environment Variables
```bash
# In Vercel Dashboard
Settings → Environment Variables
```
Should see:
- `SUPABASE_URL` = `https://xxxxx.supabase.co`
- `SUPABASE_ANON_KEY` = `eyJhbGc...` (long string)

### Step 2: Test Basic Endpoints
1. Open browser console (F12)
2. Try: `fetch('/api/health').then(r => r.json()).then(console.log)`
3. Should return: `{status: "ok"}`

### Step 3: Test Database Connection
1. Visit: `/api/test-db`
2. Should return: `{success: true, message: "Database connection successful"}`

### Step 4: Check Browser Console
1. Open DevTools (F12) → Console tab
2. Look for:
   - Red error messages
   - Network tab → Failed requests
   - Check response details

### Step 5: Check Vercel Logs
1. Go to Vercel Dashboard → Your Project → Logs
2. Look for:
   - Function errors
   - Environment variable warnings
   - Database connection errors

## Quick Fixes

### Fix 1: Redeploy After Env Var Changes
```bash
# In Vercel Dashboard
Deployments → Latest → "..." → Redeploy
```

### Fix 2: Verify Supabase Credentials
1. Supabase Dashboard → Settings → API
2. Copy:
   - Project URL → `SUPABASE_URL`
   - anon public key → `SUPABASE_ANON_KEY`
3. Update in Vercel
4. Redeploy

### Fix 3: Clear Browser Cache
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Or clear cache in browser settings

## Still Not Working?

1. **Check Vercel Function Logs:**
   - Dashboard → Your Project → Functions tab
   - Look for error messages

2. **Test Direct API Call:**
   ```javascript
   // In browser console
   fetch('https://your-app.vercel.app/api/commentators')
     .then(r => r.json())
     .then(console.log)
     .catch(console.error)
   ```

3. **Verify Supabase Tables Exist:**
   - Supabase Dashboard → Table Editor
   - Should see: commentators, producers, encoders, booths, suites, networks, blocks, etc.

4. **Check Network Tab:**
   - Browser DevTools → Network tab
   - Look for failed requests
   - Check status codes (404, 500, etc.)
   - Check response body for error messages

## Getting Help

If still stuck, provide:
1. Error message from browser console
2. Response from `/api/test-db`
3. Response from `/api/debug`
4. Vercel function logs
5. Network tab screenshot
