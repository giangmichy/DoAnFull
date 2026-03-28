import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Video } from 'expo-av';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as FileSystem from 'expo-file-system';
import { apiClient } from '../../api';
import { BACKEND_BASE_URL, WS_URL } from '../../config';
import type { MediaType, ViolationFrame } from './types';

type SseController = {
  close: () => void;
};

const FRAME_SEND_INTERVAL_MS = 300;
const FRAME_JPEG_QUALITY = 0.3;
const BOX_STALE_MS = 150;
const DETECT_DEBUG_LOG = false;

type UseRealtimeVideoDetectionParams = {
  videoRef: React.RefObject<Video | null>;
  mediaUri: string | null;
  mediaType: MediaType;
  videoId: string;
  uploadedFileId: string;
  isVideoPlaying: boolean;
  currentPositionMs: number;
};

export function useRealtimeVideoDetection({
  videoRef,
  mediaUri,
  mediaType,
  videoId,
  uploadedFileId,
  isVideoPlaying,
  currentPositionMs,
}: UseRealtimeVideoDetectionParams) {
  const [isDetecting, setIsDetecting] = useState(false);
  const [violationFrames, setViolationFrames] = useState<ViolationFrame[]>([]);
  const [videoDetections, setVideoDetections] = useState<Map<number, any[]>>(new Map());

  const sseRef = useRef<SseController | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isDetectingRef = useRef(false);
  const activeVideoIdRef = useRef('');
  const realtimeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCapturingFrameRef = useRef(false);
  const lastWsDetectionLogAtRef = useRef(0);
  const lastFrameSentLogAtRef = useRef(0);

  const debugLog = useCallback((tag: string, data?: Record<string, unknown>) => {
    if (!DETECT_DEBUG_LOG) return;
    if (data) {
      console.log(`[DetectDebug] ${tag}`, data);
      return;
    }
    console.log(`[DetectDebug] ${tag}`);
  }, []);

  const normalizeTimestampMs = useCallback((rawTs: any) => {
    const ts = Number(rawTs ?? 0);
    if (!Number.isFinite(ts) || ts < 0) return 0;
    if (Number.isInteger(ts)) return ts;
    if (ts < 1000) return ts * 1000;
    return ts;
  }, []);

  const extractBoxes = useCallback((payload: any): any[] => {
    if (Array.isArray(payload?.detections)) return payload.detections;
    if (Array.isArray(payload?.boxes)) return payload.boxes;
    return [];
  }, []);

  const normalizeBoxForLog = useCallback((box: any) => {
    const x1 = Number(box?.x1 ?? box?.x ?? 0);
    const y1 = Number(box?.y1 ?? box?.y ?? 0);
    const x2 = Number(box?.x2 ?? (x1 + Number(box?.width ?? 0)));
    const y2 = Number(box?.y2 ?? (y1 + Number(box?.height ?? 0)));
    const confidence = Number(box?.confidence ?? box?.score ?? 0);
    return {
      label: box?.label ?? box?.model ?? 'object',
      confidence,
      x1,
      y1,
      x2,
      y2,
      width: Math.max(0, x2 - x1),
      height: Math.max(0, y2 - y1),
    };
  }, []);

  const closeSse = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  }, []);

  const closeWebSocket = useCallback(() => {
    if (wsRef.current) {
      debugLog('ws.close');
      try {
        wsRef.current.close();
      } catch {
        // ignore close error
      }
      wsRef.current = null;
    }
  }, [debugLog]);

  const appendViolation = useCallback((violation: ViolationFrame) => {
    setViolationFrames((prev) => {
      const exists = prev.some(
        (item) => item.frame_number === violation.frame_number && item.timestamp === violation.timestamp,
      );
      if (exists) return prev;
      return [...prev, violation].sort((a, b) => a.timestamp - b.timestamp);
    });
  }, []);

  const appendVideoDetection = useCallback((timestamp: number, boxes: any[]) => {
    setVideoDetections((prev) => {
      const next = new Map(prev);
      next.set(timestamp, boxes || []);
      if (next.size > 1200) {
        const firstKey = next.keys().next().value;
        if (firstKey !== undefined) next.delete(firstKey);
      }
      return next;
    });
  }, []);

  const stopDetection = useCallback(() => {
    if (realtimeTimeoutRef.current) {
      clearTimeout(realtimeTimeoutRef.current);
      realtimeTimeoutRef.current = null;
    }
    closeSse();
    if (frameLoopRef.current) {
      clearInterval(frameLoopRef.current);
      frameLoopRef.current = null;
    }
    isCapturingFrameRef.current = false;
    setIsDetecting(false);
    isDetectingRef.current = false;
  }, [closeSse]);

  const resetRealtimeState = useCallback(() => {
    stopDetection();
    setViolationFrames([]);
    setVideoDetections(new Map());
  }, [stopDetection]);

  const startSseStream = useCallback(
    (
      url: string,
      onMessage: (rawData: string) => void,
      onEnd?: () => void,
      onError?: (error: Error) => void,
    ): SseController => {
      const xhr = new XMLHttpRequest();
      let lastProcessedIndex = 0;
      let buffer = '';

      const flushBuffer = () => {
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        events.forEach((eventBlock) => {
          if (!eventBlock.trim()) return;
          const dataLines = eventBlock
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart());
          if (dataLines.length === 0) return;
          onMessage(dataLines.join('\n'));
        });
      };

      xhr.onprogress = () => {
        const responseText = xhr.responseText || '';
        if (responseText.length <= lastProcessedIndex) return;
        const chunk = responseText.slice(lastProcessedIndex);
        lastProcessedIndex = responseText.length;
        buffer += chunk.replace(/\r\n/g, '\n');
        flushBuffer();
      };

      xhr.onreadystatechange = () => {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          if (buffer.trim()) {
            buffer += '\n\n';
            flushBuffer();
          }
          onEnd?.();
          return;
        }
        if (xhr.status !== 0) {
          onError?.(new Error(`SSE request failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => onError?.(new Error('SSE network error'));

      xhr.open('GET', url, true);
      xhr.setRequestHeader('Accept', 'text/event-stream');
      xhr.setRequestHeader('Cache-Control', 'no-cache');

      const token = apiClient.getToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.send();

      return {
        close: () => {
          try {
            xhr.abort();
          } catch {
            // ignore abort error
          }
        },
      };
    },
    [],
  );

  const connectRealtimeWs = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.CLOSING)
    ) {
      return;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      debugLog('ws.open', { activeVideoId: activeVideoIdRef.current || null });
      const currentVideoId = activeVideoIdRef.current;
      if (!currentVideoId) return;
      try {
        ws.send(JSON.stringify({ type: 'subscribe', videoId: currentVideoId }));
      } catch {
        // backend may not support subscribe message
      }
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const payloadVideoId = payload?.videoId ?? payload?.data?.videoId ?? null;
        if (payloadVideoId && activeVideoIdRef.current && String(payloadVideoId) !== activeVideoIdRef.current) {
          return;
        }

        if (payload.type === 'detection') {
          const ts = normalizeTimestampMs(payload.timestamp ?? payload.data?.timestamp ?? 0);
          const boxes = extractBoxes(payload.data ?? payload);
          if (boxes.length > 0) {
            const now = Date.now();
            if (now - lastWsDetectionLogAtRef.current > 800) {
              lastWsDetectionLogAtRef.current = now;
              debugLog('ws.detection', {
                timestamp: ts,
                boxes: boxes.length,
                videoId: payloadVideoId ?? activeVideoIdRef.current ?? null,
                firstBoxRaw: boxes[0] ?? null,
                firstBoxNorm: boxes[0] ? normalizeBoxForLog(boxes[0]) : null,
              });
            }
            appendVideoDetection(ts, boxes);
          }
        } else if (payload.type === 'violation' && payload.data) {
          debugLog('ws.violation', {
            timestamp: payload.data.timestamp ?? null,
            detections: extractBoxes(payload.data).length,
            frameNumber: payload.data.frame_number ?? null,
            firstBoxNorm: extractBoxes(payload.data)[0]
              ? normalizeBoxForLog(extractBoxes(payload.data)[0])
              : null,
          });
          appendViolation(payload.data as ViolationFrame);
          appendVideoDetection(
            normalizeTimestampMs(payload.data.timestamp ?? 0),
            extractBoxes(payload.data),
          );
        }
      } catch {
        // ignore malformed ws payload
      }
    };

    ws.onerror = () => debugLog('ws.error');
    ws.onclose = () => {
      debugLog('ws.closed');
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [
    appendVideoDetection,
    appendViolation,
    debugLog,
    extractBoxes,
    normalizeBoxForLog,
    normalizeTimestampMs,
  ]);

  const subscribeWsVideo = useCallback((targetVideoId: string) => {
    activeVideoIdRef.current = targetVideoId;
    debugLog('ws.subscribe', { videoId: targetVideoId });
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({ type: 'subscribe', videoId: targetVideoId }));
    } catch {
      // backend may not support subscribe message
    }
  }, [debugLog]);

  const sendCurrentFrameToWs = useCallback(async () => {
    if (!isDetectingRef.current || !isVideoPlaying || mediaType !== 'video' || !mediaUri) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const targetVideoId = activeVideoIdRef.current;
    if (!targetVideoId) return;
    if (isCapturingFrameRef.current) return;

    
    isCapturingFrameRef.current = true;
    let thumbUri = '';

    try {
      const status = await videoRef.current?.getStatusAsync();
      if (!status || !status.isLoaded || !status.isPlaying) return;

      const ts = Math.floor(status.positionMillis || 0);
      const thumbnail = await VideoThumbnails.getThumbnailAsync(mediaUri, {
        time: ts,
        quality: FRAME_JPEG_QUALITY,
      });
      thumbUri = thumbnail.uri;

      const base64 = await FileSystem.readAsStringAsync(thumbUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      ws.send(
        JSON.stringify({
          type: 'frame',
          frameData: `data:image/jpeg;base64,${base64}`,
          timestamp: ts,
          videoId: targetVideoId,
        }),
      );

      const now = Date.now();
      if (now - lastFrameSentLogAtRef.current > 800) {
        lastFrameSentLogAtRef.current = now;
        debugLog('ws.frame.sent', {
          timestamp: ts,
          bytes: base64.length,
          videoId: targetVideoId,
        });
      }
    } catch {
      // keep loop alive
    } finally {
      if (thumbUri) {
        try {
          await FileSystem.deleteAsync(thumbUri, { idempotent: true });
        } catch {
          // ignore cleanup errors
        }
      }
      isCapturingFrameRef.current = false;
    }
  }, [debugLog, isVideoPlaying, mediaType, mediaUri, videoRef]);

  useEffect(() => {
    if (!isDetecting || mediaType !== 'video') {
      if (frameLoopRef.current) {
        clearInterval(frameLoopRef.current);
        frameLoopRef.current = null;
      }
      return;
    }

    if (frameLoopRef.current) clearInterval(frameLoopRef.current);
    frameLoopRef.current = setInterval(() => {
      void sendCurrentFrameToWs();
    }, FRAME_SEND_INTERVAL_MS);

    return () => {
      if (frameLoopRef.current) {
        clearInterval(frameLoopRef.current);
        frameLoopRef.current = null;
      }
    };
  }, [isDetecting, mediaType, sendCurrentFrameToWs]);

  useEffect(() => {
    connectRealtimeWs();
    return () => {
      closeWebSocket();
      stopDetection();
    };
  }, [closeWebSocket, connectRealtimeWs, stopDetection]);

  const startVideoDetection = useCallback(() => {
    if (!videoId) return false;

    closeSse();
    setViolationFrames([]);
    setVideoDetections(new Map());
    setIsDetecting(true);
    isDetectingRef.current = true;
    activeVideoIdRef.current = videoId;

    connectRealtimeWs();
    subscribeWsVideo(videoId);

    const realtimeUrl = `${BACKEND_BASE_URL}/file-stream/${videoId}`;
    const fallbackUrl = uploadedFileId ? `${BACKEND_BASE_URL}/api/files/${uploadedFileId}/detect-stream` : '';
    let gotRealtimeEvent = false;

    const startFallbackStream = () => {
      if (!isDetectingRef.current || !fallbackUrl) return;
      closeSse();
      sseRef.current = startSseStream(
        fallbackUrl,
        (raw) => {
          try {
            const payload = JSON.parse(raw);
            if (payload.type === 'violation' && payload.data) {
              debugLog('sse.fallback.violation', {
                timestamp: payload.data.timestamp ?? null,
                detections: extractBoxes(payload.data).length,
                frameNumber: payload.data.frame_number ?? null,
              });
              appendViolation(payload.data as ViolationFrame);
              appendVideoDetection(
                normalizeTimestampMs(payload.data.timestamp ?? 0),
                extractBoxes(payload.data),
              );
            } else if (payload.type === 'complete') {
              debugLog('sse.fallback.complete');
              stopDetection();
            }
          } catch {
            // ignore invalid chunk
          }
        },
        () => {
          if (isDetectingRef.current) stopDetection();
        },
        () => {
          if (isDetectingRef.current) stopDetection();
        },
      );
    };

    realtimeTimeoutRef.current = setTimeout(() => {
      if (!gotRealtimeEvent) startFallbackStream();
    }, 2500);

    sseRef.current = startSseStream(
      realtimeUrl,
      (raw) => {
        try {
          const payload = JSON.parse(raw);
          if (payload.type === 'violation' && payload.data) {
            gotRealtimeEvent = true;
            debugLog('sse.realtime.violation', {
              timestamp: payload.data.timestamp ?? null,
              detections: extractBoxes(payload.data).length,
              frameNumber: payload.data.frame_number ?? null,
            });
            appendViolation(payload.data as ViolationFrame);
            appendVideoDetection(
              normalizeTimestampMs(payload.data.timestamp ?? 0),
              extractBoxes(payload.data),
            );
          } else if (payload.type === 'complete') {
            debugLog('sse.realtime.complete');
            stopDetection();
          }
        } catch {
          // ignore invalid chunk
        }
      },
      () => {
        if (!gotRealtimeEvent) startFallbackStream();
        else if (isDetectingRef.current) stopDetection();
      },
      () => {
        if (!gotRealtimeEvent) startFallbackStream();
        else if (isDetectingRef.current) stopDetection();
      },
    );

    return true;
  }, [
    appendVideoDetection,
    appendViolation,
    closeSse,
    connectRealtimeWs,
    debugLog,
    extractBoxes,
    normalizeTimestampMs,
    startSseStream,
    stopDetection,
    subscribeWsVideo,
    uploadedFileId,
    videoId,
  ]);

  const videoDetectionTimestamps = useMemo(
    () => Array.from(videoDetections.keys()).sort((a, b) => a - b),
    [videoDetections],
  );

  const currentVideoBoxes = useMemo(() => {
    if (videoDetectionTimestamps.length === 0) return [];
    let left = 0;
    let right = videoDetectionTimestamps.length - 1;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (videoDetectionTimestamps[mid] <= currentPositionMs) left = mid + 1;
      else right = mid;
    }
    let idx = left;
    if (videoDetectionTimestamps[idx] > currentPositionMs) idx -= 1;
    if (idx < 0) return [];
    const latestPastTs = videoDetectionTimestamps[idx];
    if (currentPositionMs - latestPastTs > BOX_STALE_MS) return [];
    return videoDetections.get(latestPastTs) || [];
  }, [currentPositionMs, videoDetectionTimestamps, videoDetections]);

  return {
    isDetecting,
    violationFrames,
    currentVideoBoxes,
    startVideoDetection,
    stopDetection,
    resetRealtimeState,
  };
}
