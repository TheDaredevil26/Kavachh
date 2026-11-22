import { useEffect, useRef, useState } from 'react';
import { EventSourcePolyfill } from 'event-source-polyfill';
import { BASE_URL, getAccessToken } from '../services/api';

/**
 * Custom React hook for Server-Sent Events (SSE) with EventSourcePolyfill.
 * Enables authenticated streaming, automatic reconnection handling, and leak-free cleanup.
 *
 * @param {string} path - Stream endpoint path, e.g. `/stream/claims/123` or `/stream/worker`
 * @param {Function} onEvent - Callback for received stream events (eventName, eventData)
 * @param {Function} onReconnect - Callback invoked on reconnection to resync state
 * @param {object} options - Optional configuration (enabled, headers)
 * @returns {{ isConnected: boolean, error: Error | null }}
 */
export function useEventStream(path, onEvent, onReconnect, options = {}) {
  const { enabled = true, customHeaders = {} } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  const eventHandlerRef = useRef(onEvent);
  eventHandlerRef.current = onEvent;

  const reconnectHandlerRef = useRef(onReconnect);
  reconnectHandlerRef.current = onReconnect;

  useEffect(() => {
    if (!enabled || !path) {
      setIsConnected(false);
      return;
    }

    const token = getAccessToken();
    const headers = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...customHeaders,
    };

    // Build URL ensuring valid SSE hub path
    let streamUrl = path;
    if (!streamUrl.startsWith('http://') && !streamUrl.startsWith('https://')) {
      const cleanPath = streamUrl.startsWith('/') ? streamUrl : `/${streamUrl}`;
      if (cleanPath.startsWith('/api/v1') || cleanPath.startsWith('/stream')) {
        streamUrl = cleanPath;
      } else {
        streamUrl = `${BASE_URL}${cleanPath}`;
      }
    }

    let es = null;
    try {
      es = new EventSourcePolyfill(streamUrl, {
        headers,
        heartbeatTimeout: 45000,
        withCredentials: true,
      });

      es.onopen = () => {
        setIsConnected(true);
        setError(null);
        if (reconnectHandlerRef.current) {
          reconnectHandlerRef.current();
        }
      };

      es.onerror = (err) => {
        setIsConnected(false);
        setError(err);
      };

      // General message listener
      es.onmessage = (event) => {
        if (!event.data) return;
        try {
          const parsed = JSON.parse(event.data);
          eventHandlerRef.current?.('message', parsed);
        } catch {
          eventHandlerRef.current?.('message', event.data);
        }
      };

      // Standard Kavach SSE Event Subscriptions
      const standardEvents = [
        'claim.state_changed',
        'trigger.announced',
        'claim.held',
        'fraud.ring_suspected',
        'claim.created',
        'payout.disbursed',
        'policy.renewed',
        'worker.alert',
      ];

      standardEvents.forEach((eventName) => {
        es.addEventListener(eventName, (e) => {
          let data = null;
          try {
            data = e.data ? JSON.parse(e.data) : null;
          } catch {
            data = e.data;
          }
          eventHandlerRef.current?.(eventName, data);
        });
      });
    } catch (err) {
      setError(err);
      setIsConnected(false);
    }

    // Cleanup: close connection on component unmount to prevent leaks
    return () => {
      if (es) {
        es.close();
        setIsConnected(false);
      }
    };
  }, [path, enabled]);

  return { isConnected, error };
}

export default useEventStream;
