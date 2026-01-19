const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Reference tables API - now uses consolidated /api/resources/[type] endpoint
export async function getResources(resourceType) {
  const response = await fetch(`${API_BASE}/api/resources/${resourceType}`);
  if (!response.ok) throw new Error(`Failed to fetch ${resourceType}`);
  return response.json();
}

export async function createResource(resourceType, name) {
  const response = await fetch(`${API_BASE}/api/resources/${resourceType}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to create ${resourceType}`);
  }
  return response.json();
}

export async function updateResource(resourceType, id, name) {
  const response = await fetch(`${API_BASE}/api/resources/${resourceType}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name })
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to update ${resourceType}`);
  }
  return response.json();
}

export async function deleteResource(resourceType, id) {
  const response = await fetch(`${API_BASE}/api/resources/${resourceType}?id=${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to delete ${resourceType}`);
  }
}

// Blocks API
export async function getBlocks(blockId = null) {
  const url = blockId 
    ? `${API_BASE}/api/blocks?id=${blockId}`
    : `${API_BASE}/api/blocks`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch blocks');
  return response.json();
}

export async function createBlock(blockData) {
  const response = await fetch(`${API_BASE}/api/blocks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(blockData)
  });
  if (!response.ok) {
    // Check if response is JSON before trying to parse
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create block');
      } catch (parseError) {
        // If JSON parsing fails, get text instead
        const text = await response.text();
        throw new Error(text || `Failed to create block: ${response.status} ${response.statusText}`);
      }
    } else {
      const text = await response.text();
      throw new Error(text || `Failed to create block: ${response.status} ${response.statusText}`);
    }
  }
  return response.json();
}

export async function updateBlock(id, blockData) {
  const response = await fetch(`${API_BASE}/api/blocks`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...blockData })
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update block');
  }
  return response.json();
}

export async function deleteBlock(id) {
  const response = await fetch(`${API_BASE}/api/blocks?id=${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete block');
  }
}

// Block relationships API - now uses consolidated /api/blocks/[blockId]/relationships endpoint
export async function getBlockRelationships(blockId, relationshipType) {
  const response = await fetch(`${API_BASE}/api/blocks/${blockId}/relationships?relationshipType=${relationshipType}`);
  if (!response.ok) throw new Error(`Failed to fetch ${relationshipType}`);
  return response.json();
}

export async function addBlockRelationship(blockId, relationshipType, relationshipId, role = null, networkId = null) {
  const bodyKey = relationshipType === 'commentators' 
    ? 'commentator_id' 
    : relationshipType === 'booths'
    ? 'booth_id'
    : 'network_id';
  
  const body = { [bodyKey]: relationshipId };
  if (relationshipType === 'commentators' && role) {
    body.role = role;
  }
  // For booths, include network_id to link booth to a specific network
  if (relationshipType === 'booths' && networkId) {
    body.network_id = networkId;
  }
  
  const response = await fetch(`${API_BASE}/api/blocks/${blockId}/relationships?relationshipType=${relationshipType}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  // Handle 409 Conflict (relationship already exists) gracefully
  if (response.status === 409) {
    // Relationship already exists, return success (idempotent operation)
    // Don't throw an error, just return a success indicator
    try {
      const data = await response.json();
      return data;
    } catch (e) {
      // If no JSON, just return a success-like object
      return { success: true, message: 'Relationship already exists' };
    }
  }
  
  if (!response.ok) {
    let errorMessage = `Failed to add ${relationshipType}`;
    try {
      const error = await response.json();
      errorMessage = error.error || errorMessage;
    } catch (e) {
      // If response is not JSON, try to get text
      try {
        const text = await response.text();
        errorMessage = text || errorMessage;
      } catch (e2) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
    }
    throw new Error(errorMessage);
  }
  return response.json();
}

export async function removeBlockRelationship(blockId, relationshipType, linkId) {
  const response = await fetch(`${API_BASE}/api/blocks/${blockId}/relationships?relationshipType=${relationshipType}&linkId=${linkId}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to remove ${relationshipType}`);
  }
}

// Booth page API
export async function getBoothBlocks(boothId) {
  const response = await fetch(`${API_BASE}/api/booths/${boothId}/blocks`);
  if (!response.ok) throw new Error('Failed to fetch booth blocks');
  return response.json();
}
