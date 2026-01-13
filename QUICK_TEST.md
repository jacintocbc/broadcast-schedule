# Quick Test Guide

## ✅ Setup Complete!

Your database migration is done and dependencies are installed. Here's what to test:

## 1. Deploy to Vercel (if not already deployed)

If you haven't deployed yet:
1. Push your code to GitHub
2. Go to Vercel dashboard
3. Import your repository (or it will auto-deploy if already connected)
4. Ensure environment variables are set:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

## 2. Test the Application

### Test the **Resources** page:
1. Navigate to your deployed app
2. Click the "Resources" tab
3. Try creating:
   - A commentator (e.g., "John Smith")
   - A producer (e.g., "Jane Doe")
   - An encoder (e.g., "Encoder 1")
   - A booth (e.g., "Booth A")
   - A suite (e.g., "Suite 1")
   - A network (e.g., "Network 1")

### Test the **Blocks** page:
1. Click the "Blocks" tab
2. Click "+ New Block"
3. Fill in:
   - Name: "Test Block"
   - Start Time: Pick a date/time
   - End Time: Pick a later time
   - Select an encoder, producer, suite (if you created any)
4. Click "Create"
5. After creating, try:
   - Adding commentators to the block
   - Adding booths to the block
   - Adding networks to the block
   - Editing the block
   - Deleting the block

### Test the **Booth Page**:
1. Click the "Booth Page" tab
2. Select a booth from the dropdown
3. View all blocks assigned to that booth

## 3. Verify in Supabase

1. Go to your Supabase dashboard
2. Navigate to "Table Editor"
3. Check that data appears in:
   - `commentators` table (if you created any)
   - `blocks` table (if you created any)
   - `block_commentators` table (if you linked any)

## 4. Common Issues & Fixes

### Issue: "Failed to fetch" errors
- **Check**: Environment variables in Vercel are set correctly
- **Check**: Supabase project is not paused
- **Check**: Browser console for detailed errors

### Issue: API routes return 404
- **Check**: `vercel.json` is in the root directory
- **Check**: API files are in the `api/` directory
- **Check**: Vercel deployment logs for errors

### Issue: Database connection errors
- **Check**: `SUPABASE_URL` starts with `https://`
- **Check**: `SUPABASE_ANON_KEY` is the anon/public key (not service_role)
- **Check**: Supabase project is active

## 5. Next Steps

Once everything is working:
- ✅ Start adding your real data (commentators, producers, etc.)
- ✅ Create blocks from your CSV events
- ✅ Set up the live XML data integration (future enhancement)

## Success Indicators

✅ Resources page loads without errors  
✅ You can create/edit/delete resources  
✅ Blocks page loads without errors  
✅ You can create blocks and assign resources  
✅ Booth page shows blocks correctly  
✅ Data persists (refresh page, data still there)  

If all these work, your setup is complete! 🎉
