import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, Image, FlatList, Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { apiClient, BoundingBox } from '../api';
import { BACKEND_BASE_URL, WS_URL } from '../config';

type ViolationFrame = {
  frame_number: number;
  timestamp: number;
  image_path: string;
  detections: any[];
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DetectionScreen() {
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoId, setVideoId] = useState<string>('');
  const [isDetecting, setIsDetecting] = useState(false);
  const [violationFrames, setViolationFrames] = useState<ViolationFrame[]>([]);
  const [imageDetections, setImageDetections] = useState<any[]>([]);
  const [detectedImageUri, setDetectedImageUri] = useState<string | null>(null);
  const videoRef = useRef<Video>(null);
  const sseRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close?.();
        sseRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const type = asset.type === 'video' ? 'video' : 'image';
    const name = asset.fileName || `file_${Date.now()}.${type === 'video' ? 'mp4' : 'jpg'}`;

    // Reset state
    setViolationFrames([]);
    setImageDetections([]);
    setDetectedImageUri(null);
    setIsDetecting(false);
    closeSse();

    setMediaUri(asset.uri);
    setMediaType(type);
    setFileName(name);

    if (type === 'video') {
      const vid = Date.now().toString();
      setVideoId(vid);
      // Upload video to backend
      try {
        await apiClient.uploadFile(asset.uri, name, vid);
      } catch (err: any) {
        console.warn('Upload error:', err.message);
      }
    }
  };

  const closeSse = () => {
    // React Native doesn't have native EventSource, we use fetch streaming
    if (sseRef.current?.abort) {
      sseRef.current.abort();
    }
    sseRef.current = null;
  };

  const startVideoDetection = useCallback(() => {
    if (!videoId) return;
    setIsDetecting(true);
    setViolationFrames([]);

    // Use fetch-based SSE for React Native
    const controller = new AbortController();
    sseRef.current = controller;

    const streamUrl = `${BACKEND_BASE_URL}/file-stream/${videoId}`;
    
    fetch(streamUrl, { signal: controller.signal })
      .then(async (response) => {
        const reader = response.body?.getReader();
        if (!reader) return;
        
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const payload = JSON.parse(line.slice(6));
                if (payload.type === 'violation' && payload.data) {
                  setViolationFrames(prev => {
                    const exists = prev.some(
                      v => v.frame_number === payload.data.frame_number
                    );
                    if (exists) return prev;
                    return [...prev, payload.data].sort((a, b) => a.timestamp - b.timestamp);
                  });
                }
              } catch { /* skip invalid */ }
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.warn('SSE error:', err);
        }
      })
      .finally(() => {
        setIsDetecting(false);
      });
  }, [videoId]);

  const detectImage = useCallback(async () => {
    if (!mediaUri || !fileName) return;
    setIsProcessing(true);
    setImageDetections([]);
    try {
      const result = await apiClient.detectImage(mediaUri, fileName);
      if (result.detections && result.detections.length > 0) {
        setImageDetections(result.detections);
      } else {
        Alert.alert('Kết quả', 'Không phát hiện vi phạm nào');
      }
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Phát hiện thất bại');
    } finally {
      setIsProcessing(false);
    }
  }, [mediaUri, fileName]);

  const handleDetect = () => {
    if (mediaType === 'image') {
      detectImage();
    } else if (mediaType === 'video') {
      if (isDetecting) {
        closeSse();
        setIsDetecting(false);
      } else {
        startVideoDetection();
      }
    }
  };

  const renderViolationItem = ({ item }: { item: ViolationFrame }) => {
    const imageUrl = item.image_path?.startsWith('http')
      ? item.image_path
      : `${BACKEND_BASE_URL}${item.image_path}`;
    return (
      <TouchableOpacity style={styles.violationCard}>
        <Image source={{ uri: imageUrl }} style={styles.violationImage} resizeMode="cover" />
        <View style={styles.violationBadge}>
          <Text style={styles.violationBadgeText}>{item.detections?.length || 0}</Text>
        </View>
        <Text style={styles.violationTime}>{(item.timestamp / 1000).toFixed(1)}s</Text>
      </TouchableOpacity>
    );
  };

  const modelColorMap: Record<string, string> = {
    co3soc: '#ef4444',
    duongluoibo: '#22c55e',
    vnmap: '#3b82f6',
  };

  const modelNameMap: Record<string, string> = {
    co3soc: 'Cờ 3 sọc',
    duongluoibo: 'Đường lưỡi bò',
    vnmap: 'Bản đồ VN',
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Upload Area */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cài đặt phân tích</Text>
        <TouchableOpacity style={styles.uploadArea} onPress={pickMedia}>
          <Ionicons name="cloud-upload-outline" size={36} color="#94a3b8" />
          <Text style={styles.uploadText}>Chọn ảnh hoặc video</Text>
        </TouchableOpacity>

        {fileName ? (
          <View style={styles.fileInfo}>
            <Ionicons
              name={mediaType === 'video' ? 'videocam-outline' : 'image-outline'}
              size={18} color="#64748b"
            />
            <Text style={styles.fileInfoText} numberOfLines={1}>{fileName}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.detectButton, (!mediaUri || isProcessing) && styles.detectButtonDisabled]}
          onPress={handleDetect}
          disabled={!mediaUri || isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="scan-outline" size={20} color="#fff" />
          )}
          <Text style={styles.detectButtonText}>
            {mediaType === 'video'
              ? (isDetecting ? 'Dừng phát hiện' : 'Bắt đầu phát hiện')
              : (isProcessing ? 'Đang phân tích...' : 'Bắt đầu phát hiện')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Media Preview */}
      {mediaUri && (
        <View style={styles.card}>
          {mediaType === 'video' ? (
            <Video
              ref={videoRef}
              source={{ uri: mediaUri }}
              style={styles.mediaPreview}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
            />
          ) : (
            <Image source={{ uri: mediaUri }} style={styles.mediaPreview} resizeMode="contain" />
          )}
        </View>
      )}

      {/* Image Detection Results */}
      {imageDetections.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Kết quả phát hiện</Text>
          {imageDetections.map((det: any, idx: number) => {
            const label = det.label || det.model || 'unknown';
            const conf = det.confidence ?? det.score ?? 0;
            const color = modelColorMap[label] || '#6b7280';
            return (
              <View key={idx} style={styles.detectionRow}>
                <View style={[styles.detectionDot, { backgroundColor: color }]} />
                <Text style={styles.detectionLabel}>{modelNameMap[label] || label}</Text>
                <Text style={styles.detectionConf}>{(conf * 100).toFixed(1)}%</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Video Violation Frames */}
      {mediaType === 'video' && (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>Vi phạm phát hiện</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{violationFrames.length} frames</Text>
            </View>
          </View>
          {violationFrames.length > 0 ? (
            <FlatList
              data={violationFrames}
              renderItem={renderViolationItem}
              keyExtractor={(item) => `${item.frame_number}-${item.timestamp}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.violationList}
            />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="shield-outline" size={32} color="#cbd5e1" />
              <Text style={styles.emptyText}>
                {isDetecting ? 'Đang phân tích...' : 'Chưa có dữ liệu vi phạm'}
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  uploadArea: {
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    borderRadius: 12,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  uploadText: { fontSize: 13, color: '#94a3b8', marginTop: 8 },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 10,
    gap: 8,
    marginBottom: 12,
  },
  fileInfoText: { flex: 1, fontSize: 13, color: '#475569' },
  detectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7c3aed',
    borderRadius: 10,
    height: 44,
    gap: 8,
  },
  detectButtonDisabled: { opacity: 0.5 },
  detectButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  mediaPreview: { width: '100%', height: 250, borderRadius: 8, backgroundColor: '#000' },
  detectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  detectionDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  detectionLabel: { flex: 1, fontSize: 14, color: '#334155', fontWeight: '500' },
  detectionConf: { fontSize: 13, color: '#64748b' },
  countBadge: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countBadgeText: { fontSize: 11, color: '#dc2626', fontWeight: '600' },
  violationList: { gap: 10 },
  violationCard: {
    width: 120,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  violationImage: { width: 120, height: 70, backgroundColor: '#e2e8f0' },
  violationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#ef4444',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  violationBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  violationTime: { textAlign: 'center', fontSize: 11, color: '#64748b', paddingVertical: 4 },
  emptyState: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    borderRadius: 8,
    gap: 8,
  },
  emptyText: { fontSize: 13, color: '#94a3b8' },
});
