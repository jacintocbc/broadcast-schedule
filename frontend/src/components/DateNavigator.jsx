import moment from 'moment'

function DateNavigator({ dates, selectedDate, onDateChange }) {
  if (!dates || dates.length === 0) {
    return null
  }

  const currentIndex = dates.indexOf(selectedDate)
  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex < dates.length - 1

  const handlePrev = () => {
    if (canGoPrev) {
      onDateChange(dates[currentIndex - 1])
    }
  }

  const handleNext = () => {
    if (canGoNext) {
      onDateChange(dates[currentIndex + 1])
    }
  }

  const handleDateSelect = (e) => {
    onDateChange(e.target.value)
  }

  const formatDate = (dateStr) => {
    return moment(dateStr).format('ddd, MMM D, YYYY')
  }

  return (
    <div className="flex items-center gap-4">
      <div className="text-sm font-medium text-gray-700">
        View Date:
      </div>
      
      <button
        onClick={handlePrev}
        disabled={!canGoPrev}
        className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
        title="Previous day"
      >
        ← Prev
      </button>

      <select
        value={selectedDate || ''}
        onChange={handleDateSelect}
        className="px-3 py-1 border border-gray-300 rounded bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {dates.map((date) => (
          <option key={date} value={date}>
            {formatDate(date)}
          </option>
        ))}
      </select>

      <button
        onClick={handleNext}
        disabled={!canGoNext}
        className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
        title="Next day"
      >
        Next →
      </button>

      <div className="text-sm text-gray-500 ml-auto">
        {currentIndex + 1} of {dates.length} days
      </div>
    </div>
  )
}

export default DateNavigator
