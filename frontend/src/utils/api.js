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
    const error = await response.json();
    throw new Error(error.error || 'Failed to create block');
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

export async function addBlockRelationship(blockId, relationshipType, relationshipId, role = null) {
  const bodyKey = relationshipType === 'commentators' 
    ? 'commentator_id' 
    : relationshipType === 'booths'
    ? 'booth_id'
    : 'network_id';
  
  const body = { [bodyKey]: relationshipId };
  if (relationshipType === 'commentators' && role) {
    body.role = role;
  }
  
  const response = await fetch(`${API_BASE}/api/blocks/${blockId}/relationships?relationshipType=${relationshipType}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
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
