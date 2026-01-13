import { handleCRUD } from './utils/crud.js';

// Valid resource types
const validTypes = ['commentators', 'producers', 'encoders', 'booths', 'suites', 'networks'];

export default async function handler(req, res) {
  // Parse resource type from URL
  // Vercel rewrite converts /api/resources/{type} to /api/resources?type={type}
  let resourceType = req.query?.type;
  
  // Fallback: Parse from URL path if query param not available
  if (!resourceType && req.url) {
    const urlPath = req.url.split('?')[0];
    const match = urlPath.match(/\/resources\/([^/]+)$/);
    if (match && match[1]) {
      resourceType = match[1];
    }
  }
  
  if (!resourceType) {
    return res.status(400).json({ 
      error: 'Resource type is required',
      url: req.url,
      query: req.query,
      hint: 'Use /api/resources/{type} where type is one of: ' + validTypes.join(', ')
    });
  }
  
  if (!validTypes.includes(resourceType)) {
    return res.status(400).json({ 
      error: 'Invalid resource type',
      received: resourceType,
      validTypes 
    });
  }
  
  return handleCRUD(resourceType, req, res);
}
