import { useMemo } from 'react'
import Timeline from 'react-calendar-timeline'
import 'react-calendar-timeline/lib/Timeline.css'
import moment from 'moment'

function TimelineView({ events, selectedDate, onItemSelect }) {
  // Create a map of item id to original event for click handling
  const itemToEventMap = useMemo(() => {
    const map = {}
    if (events && events.length > 0) {
      events.forEach((event, index) => {
        const itemId = `${event.id}-${index}`
        map[itemId] = event
      })
    }
    return map
  }, [events])

  // Transform events data for react-calendar-timeline
  const { groups, items, timeStart, timeEnd } = useMemo(() => {
    if (!events || events.length === 0) {
      const defaultDate = selectedDate ? moment(selectedDate) : moment()
      return { 
        groups: [], 
        items: [], 
        timeStart: defaultDate.startOf('day'), 
        timeEnd: defaultDate.endOf('day') 
      }
    }

    // Get unique channel names (groups)
    const uniqueChannels = [...new Set(events.map(e => e.group).filter(Boolean))]
    const groups = uniqueChannels.map((channelName, index) => ({
      id: index + 1,
      title: channelName
    }))

    // Create a map of channel name to group id
    const channelToGroupId = {}
    groups.forEach(group => {
      channelToGroupId[group.title] = group.id
    })
    
    // Transform events to timeline items
    const items = events
      .filter(event => event.group && channelToGroupId[event.group])
      .map((event, index) => {
        const itemId = `${event.id}-${index}`
        return {
          id: itemId,
          group: channelToGroupId[event.group],
          title: event.title,
          start_time: moment(event.start_time),
          end_time: moment(event.end_time)
        }
      })

    // For single day view, set time range to the selected day
    if (selectedDate) {
      const dayStart = moment(selectedDate).startOf('day')
      const dayEnd = moment(selectedDate).endOf('day')
      return { groups, items, timeStart: dayStart, timeEnd: dayEnd }
    }

    // Calculate time range from events (fallback)
    const allStartTimes = items.map(item => item.start_time.valueOf())
    const allEndTimes = items.map(item => item.end_time.valueOf())
    const minTime = Math.min(...allStartTimes)
    const maxTime = Math.max(...allEndTimes)

    // Add some padding
    const timeStart = moment(minTime).subtract(1, 'hour')
    const timeEnd = moment(maxTime).add(1, 'hour')

    return { groups, items, timeStart, timeEnd }
  }, [events, selectedDate])

  if (groups.length === 0 || items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No events to display
      </div>
    )
  }

  const handleItemClick = (itemId, e, time) => {
    const event = itemToEventMap[itemId]
    if (event && onItemSelect) {
      onItemSelect(event)
    }
  }

  // Calculate minimum width for items based on title length
  const itemRenderer = ({ item, itemContext, getItemProps }) => {
    const { title } = item
    // Calculate minimum width based on text length (approximately 8px per character)
    const minWidth = Math.max(120, title.length * 8 + 20)
    
    const props = getItemProps({
      style: {
        minWidth: `${minWidth}px`,
        ...getItemProps().style
      }
    })
    
    return (
      <div {...props} style={{ ...props.style, minWidth: `${minWidth}px` }}>
        <div className="rct-item-content" style={{ minWidth: `${minWidth - 10}px` }}>
          {title}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-x-auto">
      <Timeline
        groups={groups}
        items={items}
        defaultTimeStart={timeStart}
        defaultTimeEnd={timeEnd}
        visibleTimeStart={timeStart.valueOf()}
        visibleTimeEnd={timeEnd.valueOf()}
        canMove={false}
        canResize={false}
        canSelect={true}
        onItemClick={handleItemClick}
        canZoom={true}
        canChangeGroup={false}
        stackItems
        lineHeight={60}
        itemHeightRatio={0.75}
        minZoom={60 * 60 * 1000} // 1 hour minimum
        maxZoom={24 * 60 * 60 * 1000} // 24 hours maximum
        itemRenderer={itemRenderer}
      />
    </div>
  )
}

export default TimelineView
