import moment from 'moment'

function EventDetailPanel({ event, onClose, onAddToCBC, dark }) {
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
    <div className={`h-full flex flex-col ${dark ? 'bg-gray-800 text-gray-100' : 'bg-white border-l border-gray-300 shadow-lg'}`}>
      <div className={`p-4 border-b flex items-center justify-between ${dark ? 'border-gray-600 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
        <h2 className={`text-xl font-bold ${dark ? 'text-white' : 'text-gray-800'}`}>Event Details</h2>
        <button
          onClick={onClose}
          className={`text-2xl leading-none ${dark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}
          title="Close"
        >
          ×
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Basic Information */}
          <section>
            <h3 className={`text-sm font-semibold uppercase mb-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>Basic Information</h3>
            <div className="space-y-2">
              <DetailRow label="ID" value={event.id} dark={dark} />
              <DetailRow label="Title" value={event.title} dark={dark} />
              <DetailRow label="Channel" value={event.group} dark={dark} />
              {event.gamesDay && <DetailRow label="Games Day" value={event.gamesDay} dark={dark} />}
            </div>
          </section>

          {/* Schedule */}
          <section>
            <h3 className={`text-sm font-semibold uppercase mb-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>Schedule</h3>
            <div className="space-y-2">
              <DetailRow label="Date" value={event.date || moment(event.start_time).format('DD/MM/YYYY')} dark={dark} />
              <DetailRow label="Start Time" value={formatDateTime(event.start_time)} dark={dark} />
              <DetailRow label="End Time" value={formatDateTime(event.end_time)} dark={dark} />
              <DetailRow label="Duration" value={formatDuration(event.start_time, event.end_time)} dark={dark} />
              {event.txStartTime && <DetailRow label="Tx Start" value={event.txStartTime} dark={dark} />}
              {event.txEndTime && <DetailRow label="Tx End" value={event.txEndTime} dark={dark} />}
              {event.txDuration && <DetailRow label="Tx Duration" value={event.txDuration} dark={dark} />}
            </div>
          </section>

          {/* Transmission Details */}
          {(event.txType || event.videoFeed || event.source) && (
            <section>
              <h3 className={`text-sm font-semibold uppercase mb-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>Transmission</h3>
              <div className="space-y-2">
                {event.txType && <DetailRow label="Type" value={event.txType} dark={dark} />}
                {event.videoFeed && <DetailRow label="Video Feed" value={event.videoFeed} dark={dark} />}
                {event.source && <DetailRow label="Source" value={event.source} dark={dark} />}
                {event.rights && <DetailRow label="Rights" value={event.rights} dark={dark} />}
              </div>
            </section>
          )}

          {/* Raw Data (All CSV Fields) */}
          {event.rawData && Object.keys(event.rawData).length > 0 && (
            <section>
              <h3 className={`text-sm font-semibold uppercase mb-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>All Fields</h3>
              <div className="space-y-2">
                {Object.entries(event.rawData)
                  .filter(([key]) => {
                    // Skip already displayed fields
                    const displayedKeys = ['Id', 'Title', 'ChannelName', 'Date', 'Tx Start Time', 'Tx End Time', 'Tx Duration', 'Tx Type', 'VideoFeed', 'Source', 'Rights', 'GamesDay']
                    return !displayedKeys.some(dk => key.toLowerCase().includes(dk.toLowerCase()))
                  })
                  .map(([key, value]) => (
                    <DetailRow key={key} label={key} value={value} dark={dark} />
                  ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value, dark }) {
  if (!value || value === '' || value === 'N/A') {
    return null
  }
  
  return (
    <div className="flex flex-col sm:flex-row sm:items-start py-1">
      <dt className={`text-sm font-medium sm:w-1/3 sm:pr-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{label}:</dt>
      <dd className={`text-sm sm:w-2/3 break-words ${dark ? 'text-gray-200' : 'text-gray-900'}`}>{value}</dd>
    </div>
  )
}

export default EventDetailPanel
