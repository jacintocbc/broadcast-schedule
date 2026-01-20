import { supabase } from './supabase'

class RealtimeManager {
  constructor() {
    this.channels = new Map()
    this.subscribers = new Map()
  }
  
  /**
   * Subscribe to a table with a callback
   * @param {string} table - Table name to subscribe to
   * @param {Function} callback - Callback function when data changes
   * @param {Object} options - Additional options (filter, event types)
   * @returns {Function} Unsubscribe function
   */
  subscribe(table, callback, options = {}) {
    const key = `${table}:${options.filter || 'all'}`
    
    // If already subscribed, just add callback
    if (this.subscribers.has(key)) {
      this.subscribers.get(key).push(callback)
      return () => this.unsubscribe(table, callback, options)
    }
    
    // Create new subscription
    this.subscribers.set(key, [callback])
    
    const channelName = `realtime:${key}:${Date.now()}`
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes',
        {
          event: options.event || '*',
          schema: 'public',
          table: table,
          filter: options.filter || undefined
        },
        (payload) => {
          // Notify all subscribers
          const callbacks = this.subscribers.get(key)
          if (callbacks) {
            callbacks.forEach(cb => {
              try {
                cb(payload)
              } catch (error) {
                console.error(`Error in real-time callback for ${table}:`, error)
              }
            })
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error(`Error subscribing to ${table}`)
        } else if (status === 'TIMED_OUT') {
          console.error(`Subscription to ${table} timed out`)
        }
      })
    
    this.channels.set(key, channel)
    
    // Return unsubscribe function
    return () => this.unsubscribe(table, callback, options)
  }
  
  /**
   * Unsubscribe from a table
   */
  unsubscribe(table, callback, options = {}) {
    const key = `${table}:${options.filter || 'all'}`
    const callbacks = this.subscribers.get(key)
    
    if (callbacks) {
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
      
      // If no more callbacks, remove channel
      if (callbacks.length === 0) {
        const channel = this.channels.get(key)
        if (channel) {
          supabase.removeChannel(channel)
          this.channels.delete(key)
          this.subscribers.delete(key)
        }
      }
    }
  }
  
  /**
   * Cleanup all subscriptions
   */
  cleanup() {
    this.channels.forEach(channel => {
      supabase.removeChannel(channel)
    })
    this.channels.clear()
    this.subscribers.clear()
  }
}

export const realtimeManager = new RealtimeManager()
