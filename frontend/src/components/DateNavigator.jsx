import moment from 'moment'

function DateNavigator({ dates, selectedDate, onDateChange, dark }) {
  if (!dates || dates.length === 0) {
    return null
  }

  const formatDate = (dateStr) => {
    return moment(dateStr).format('MMM D')
  }

  const labelClass = dark ? 'text-sm font-medium text-gray-300' : 'text-sm font-medium text-gray-700'
  const btnSelected = 'bg-emerald-500/30 text-white border border-emerald-400/50 font-semibold'
  const btnUnselected = dark ? 'bg-gray-600 text-gray-200 hover:bg-gray-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className={labelClass}>
        View Date:
      </div>
      
      {dates.map((date) => (
        <button
          key={date}
          onClick={() => onDateChange(date)}
          className={`px-3 py-1 text-sm rounded transition-colors ${
            selectedDate === date ? btnSelected : btnUnselected
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
