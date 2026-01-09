import moment from 'moment'

function EventDetailPanel({ event, onClose }) {
  if (!event) {
    return null
  }

  const formatTime = (isoString) => {
    return moment(isoString).format('HH:mm:ss')
  }

  const formatDateTime = (isoString) => {
    return moment(isoString).format('ddd, MMM D, YYYY HH:mm:ss')
  }

  const formatDuration = (start, end) => {
    const duration = moment.duration(moment(end).diff(moment(start)))
    const hours = Math.floor(duration.asHours())
    const minutes = duration.minutes()
    const seconds = duration.seconds()
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  return (
    <div className="h-full bg-white border-l border-gray-300 shadow-lg flex flex-col">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Event Details</h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          title="Close"
        >
          ×
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Basic Information */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">Basic Information</h3>
            <div className="space-y-2">
              <DetailRow label="ID" value={event.id} />
              <DetailRow label="Title" value={event.title} />
              <DetailRow label="Channel" value={event.group} />
              {event.gamesDay && <DetailRow label="Games Day" value={event.gamesDay} />}
            </div>
          </section>

          {/* Schedule */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">Schedule</h3>
            <div className="space-y-2">
              <DetailRow label="Date" value={event.date || moment(event.start_time).format('DD/MM/YYYY')} />
              <DetailRow label="Start Time" value={formatDateTime(event.start_time)} />
              <DetailRow label="End Time" value={formatDateTime(event.end_time)} />
              <DetailRow label="Duration" value={formatDuration(event.start_time, event.end_time)} />
              {event.txStartTime && <DetailRow label="Tx Start" value={event.txStartTime} />}
              {event.txEndTime && <DetailRow label="Tx End" value={event.txEndTime} />}
              {event.txDuration && <DetailRow label="Tx Duration" value={event.txDuration} />}
            </div>
          </section>

          {/* Transmission Details */}
          {(event.txType || event.videoFeed || event.source) && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">Transmission</h3>
              <div className="space-y-2">
                {event.txType && <DetailRow label="Type" value={event.txType} />}
                {event.videoFeed && <DetailRow label="Video Feed" value={event.videoFeed} />}
                {event.source && <DetailRow label="Source" value={event.source} />}
                {event.rights && <DetailRow label="Rights" value={event.rights} />}
              </div>
            </section>
          )}

          {/* Raw Data (All CSV Fields) */}
          {event.rawData && Object.keys(event.rawData).length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase mb-2">All Fields</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {Object.entries(event.rawData)
                  .filter(([key]) => {
                    // Skip already displayed fields
                    const displayedKeys = ['Id', 'Title', 'ChannelName', 'Date', 'Tx Start Time', 'Tx End Time', 'Tx Duration', 'Tx Type', 'VideoFeed', 'Source', 'Rights', 'GamesDay']
                    return !displayedKeys.some(dk => key.toLowerCase().includes(dk.toLowerCase()))
                  })
                  .map(([key, value]) => (
                    <DetailRow key={key} label={key} value={value} />
                  ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }) {
  if (!value || value === '' || value === 'N/A') {
    return null
  }
  
  return (
    <div className="flex flex-col sm:flex-row sm:items-start py-1">
      <dt className="text-sm font-medium text-gray-500 sm:w-1/3 sm:pr-2">{label}:</dt>
      <dd className="text-sm text-gray-900 sm:w-2/3 break-words">{value}</dd>
    </div>
  )
}

export default EventDetailPanel
