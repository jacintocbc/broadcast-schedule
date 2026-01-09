import { useState } from 'react'

function FileUploader({ onUploadSuccess }) {
  const [uploading, setUploading] = useState(false)
  const [loadingStatic, setLoadingStatic] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file')
      return
    }

    setUploading(true)
    setError(null)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Upload failed')
      }

      const data = await response.json()
      setMessage(`Successfully uploaded and processed ${data.count} events`)
      
      // Clear the file input
      e.target.value = ''
      
      // Notify parent component
      if (onUploadSuccess) {
        onUploadSuccess()
      }
    } catch (err) {
      setError(err.message)
      console.error('Upload error:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleLoadStatic = async () => {
    setLoadingStatic(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch('/api/load-static', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to load static file')
      }

      const data = await response.json()
      setMessage(`Successfully loaded ${data.count} events from ${data.filename}`)
      
      // Notify parent component
      if (onUploadSuccess) {
        onUploadSuccess()
      }
    } catch (err) {
      setError(err.message)
      console.error('Load static error:', err)
    } finally {
      setLoadingStatic(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700 mr-2">
            Upload Schedule CSV:
          </span>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            disabled={uploading || loadingStatic}
            className="text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100
              disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>
        
        <span className="text-gray-400">or</span>
        
        <button
          onClick={handleLoadStatic}
          disabled={uploading || loadingStatic}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          {loadingStatic ? 'Loading...' : 'Load from data/schedule.csv'}
        </button>
      </div>
      
      {(uploading || loadingStatic) && (
        <div className="text-sm text-blue-600">
          {uploading ? 'Uploading and processing...' : 'Loading static file...'}
        </div>
      )}
      
      {message && (
        <div className="text-sm text-green-600">{message}</div>
      )}
      
      {error && (
        <div className="text-sm text-red-600">Error: {error}</div>
      )}
    </div>
  )
}

export default FileUploader
