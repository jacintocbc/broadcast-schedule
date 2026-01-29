# Supabase Realtime Setup Guide

## Issue
Real-time subscriptions are set up but not receiving events (e.g., block deletions, updates).

## Solution: Enable Realtime for Tables

Supabase Realtime must be enabled for each table you want to subscribe to. By default, Realtime is **disabled** for security reasons.

### Step 1: Enable Realtime in Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Database** → **Replication**
3. For each table you need real-time updates, toggle **Realtime** to **ON**:

**Required Tables:**
- ✅ `blocks` - For block create/update/delete
- ✅ `block_booths` - For booth assignment changes
- ✅ `block_commentators` - For commentator assignment changes
- ✅ `block_networks` - For network assignment changes
- ✅ `planning` - For On Air row changes (Planning page)
- ✅ `encoders` - For encoder changes (optional)
- ✅ `booths` - For booth changes (optional)
- ✅ `commentators` - For commentator changes (optional)
- ✅ `producers` - For producer changes (optional)
- ✅ `suites` - For suite changes (optional)
- ✅ `networks` - For network changes (optional)

### Step 2: Verify Realtime is Enabled

1. In Supabase Dashboard → **Database** → **Replication**
2. You should see a green toggle next to each table
3. If a table shows "Not replicating", click it to enable

### Step 3: Test Real-time

1. Open your app in two browser windows
2. Make a change in one window (e.g., delete a block)
3. Check the browser console in the other window
4. You should see:
   - `📨 Received real-time event for blocks:`
   - `🔄 Blocks changed:`

### Alternative: Enable via SQL

If you prefer SQL, run this in Supabase SQL Editor:

```sql
-- Enable Realtime for all required tables
ALTER PUBLICATION supabase_realtime ADD TABLE blocks;
ALTER PUBLICATION supabase_realtime ADD TABLE block_booths;
ALTER PUBLICATION supabase_realtime ADD TABLE block_commentators;
ALTER PUBLICATION supabase_realtime ADD TABLE block_networks;
ALTER PUBLICATION supabase_realtime ADD TABLE planning;
ALTER PUBLICATION supabase_realtime ADD TABLE encoders;
ALTER PUBLICATION supabase_realtime ADD TABLE booths;
ALTER PUBLICATION supabase_realtime ADD TABLE commentators;
ALTER PUBLICATION supabase_realtime ADD TABLE producers;
ALTER PUBLICATION supabase_realtime ADD TABLE suites;
ALTER PUBLICATION supabase_realtime ADD TABLE networks;
```

### Troubleshooting

**Issue: Subscriptions show "SUBSCRIBED" but no events**
- **Fix:** Enable Realtime for the table in Database → Replication
- **Fix:** Check that the table name matches exactly (case-sensitive)

**Issue: "Permission denied" errors**
- **Fix:** Check Row Level Security (RLS) policies allow SELECT on the tables
- **Fix:** Verify your anon key has the correct permissions

**Issue: Events received but UI doesn't update**
- **Fix:** Check browser console for callback errors
- **Fix:** Verify the callback function is being called (look for `📨 Received real-time event` logs)

### Verify Setup

After enabling Realtime, check the browser console:

1. **On page load**, you should see:
   ```
   ✅ Supabase client initialized
   ✅ Subscribed to blocks changes
   ✅ Subscribed to block_booths changes
   ```

2. **When making a change**, you should see:
   ```
   📨 Received real-time event for blocks: { eventType: 'DELETE', ... }
   📢 Notifying 1 callback(s) for blocks
   🔄 Blocks changed: DELETE
   ```

If you see the subscription messages but not the event messages, Realtime is not enabled for that table.
