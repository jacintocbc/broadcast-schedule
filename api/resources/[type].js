import { handleCRUD } from '../utils/crud.js';

// Valid resource types
const validTypes = ['commentators', 'producers', 'encoders', 'booths', 'suites', 'networks'];

export default async function handler(req, res) {
  // Get resource type from URL
  const resourceType = req.query.type || req.query['[type]'];
  
  if (!resourceType) {
    return res.status(400).json({ error: 'Resource type is required' });
  }
  
  if (!validTypes.includes(resourceType)) {
    return res.status(400).json({ 
      error: 'Invalid resource type',
      validTypes 
    });
  }
  
  return handleCRUD(resourceType, req, res);
}
