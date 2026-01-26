import moment from 'moment'

function DateNavigator({ dates, selectedDate, onDateChange }) {
  if (!dates || dates.length === 0) {
    return null
  }

  const formatDate = (dateStr) => {
    return moment(dateStr).format('MMM D')
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="text-sm font-medium text-gray-700">
        View Date:
      </div>
      
      {dates.map((date) => (
        <button
          key={date}
          onClick={() => onDateChange(date)}
          className={`px-3 py-1 text-sm rounded transition-colors ${
            selectedDate === date
              ? 'bg-blue-600 text-white font-semibold'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
          title={formatDate(date)}
        >
          {formatDate(date)}
        </button>
      ))}
    </div>
  )
}

export default DateNavigator
