import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  FlatList,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api';
import { BACKEND_BASE_URL } from '../config';
import BoundingBoxOverlay from '../components/BoundingBoxOverlay';
import { useRealtimeVideoDetection } from './detection/useRealtimeVideoDetection';
import type { MediaType, ViolationFrame } from './detection/types';


export default function DetectionScreen() {
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoId, setVideoId] = useState<string>('');
  const [uploadedFileId, setUploadedFileId] = useState<string>('');
  const [imageDetections, setImageDetections] = useState<any[]>([]);
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  const [imageLayoutSize, setImageLayoutSize] = useState({ width: 0, height: 0 });
  const [videoLayoutSize, setVideoLayoutSize] = useState({ width: 0, height: 0 });
  const [videoNaturalSize, setVideoNaturalSize] = useState({ width: 0, height: 0 });
  const [currentPositionMs, setCurrentPositionMs] = useState(0);
  const [videoDurationMs, setVideoDurationMs] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  const videoRef = useRef<Video>(null);

  const {
    isDetecting,
    violationFrames,
    currentVideoBoxes,
    startVideoDetection,
    stopDetection,
    resetRealtimeState,
  } = useRealtimeVideoDetection({
    videoRef,
    mediaUri,
    mediaType,
    videoId,
    uploadedFileId,
    isVideoPlaying,
    currentPositionMs,
  });

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

  const detectImageBySource = useCallback(async (uri: string, name: string) => {
    setIsProcessing(true);
    setImageDetections([]);
    try {
      const result = await apiClient.detectImage(uri, name);
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
  }, []);

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const type: MediaType = asset.type === 'video' ? 'video' : 'image';
    const name = asset.fileName || `file_${Date.now()}.${type === 'video' ? 'mp4' : 'jpg'}`;

    resetRealtimeState();

    setImageDetections([]);
    setUploadedFileId('');
    setCurrentPositionMs(0);
    setVideoDurationMs(0);
    setImageNaturalSize({ width: 0, height: 0 });
    setVideoNaturalSize({ width: 0, height: 0 });
    setMediaUri(asset.uri);
    setMediaType(type);
    setFileName(name);

    if (type === 'video') {
      const vid = Date.now().toString();
      setVideoId(vid);
      try {
        const uploaded = await apiClient.uploadFile(asset.uri, name, vid);
        setUploadedFileId(uploaded.id);
      } catch (err: any) {
        Alert.alert('Upload lỗi', err?.message || 'Không thể tải video lên backend');
      }
      return;
    }

    setVideoId('');
  };

  const handleDetect = () => {
    if (mediaType === 'image') {
      if (!mediaUri || !fileName) return;
      void detectImageBySource(mediaUri, fileName);
      return;
    }

    if (mediaType === 'video') {
      if (isDetecting) {
        stopDetection();
      } else {
        const ok = startVideoDetection();
        if (!ok) {
          Alert.alert('Thiếu dữ liệu', 'Chưa có videoId để bắt đầu phát hiện');
        }
      }
    }
  };

  const handleSeekToViolation = async (timestamp: number) => {
    if (!videoRef.current) return;
    try {
      await videoRef.current.setPositionAsync(timestamp);
      setCurrentPositionMs(timestamp);
    } catch {
      // ignore seek error
    }
  };

  const renderViolationItem = ({ item }: { item: ViolationFrame }) => {
    const imageUrl = item.image_path?.startsWith('http')
      ? item.image_path
      : `${BACKEND_BASE_URL}${item.image_path}`;
    return (
      <TouchableOpacity
        style={styles.violationCard}
        onPress={() => handleSeekToViolation(item.timestamp)}
      >
        <Image source={{ uri: imageUrl }} style={styles.violationImage} resizeMode="cover" />
        <View style={styles.violationBadge}>
          <Text style={styles.violationBadgeText}>{item.detections?.length || 0}</Text>
        </View>
        <Text style={styles.violationTime}>{(item.timestamp / 1000).toFixed(1)}s</Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
              size={18}
              color="#64748b"
            />
            <Text style={styles.fileInfoText} numberOfLines={1}>
              {fileName}
            </Text>
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
              ? isDetecting
                ? 'Dừng phát hiện'
                : 'Bắt đầu phát hiện'
              : isProcessing
                ? 'Đang phân tích...'
                : 'Bắt đầu phát hiện'}
          </Text>
        </TouchableOpacity>
      </View>

      {mediaUri && (
        <View style={styles.card}>
          {mediaType === 'video' ? (
            <>
              <View
                style={styles.videoPreviewWrap}
                onLayout={(event) => {
                  const { width, height } = event.nativeEvent.layout;
                  setVideoLayoutSize({ width, height });
                }}
              >
                <Video
                  ref={videoRef}
                  source={{ uri: mediaUri }}
                  style={styles.mediaPreview}
                  useNativeControls
                  progressUpdateIntervalMillis={200}
                  resizeMode={ResizeMode.CONTAIN}
                  onReadyForDisplay={(event) => {
                    const naturalSize = event.naturalSize;
                    if (naturalSize?.width && naturalSize?.height) {
                      setVideoNaturalSize({
                        width: naturalSize.width,
                        height: naturalSize.height,
                      });
                    }
                  }}
                  onPlaybackStatusUpdate={(status: AVPlaybackStatus) => {
                    if (!status.isLoaded) {
                      setIsVideoPlaying(false);
                      return;
                    }
                    setIsVideoPlaying(!!status.isPlaying);
                    setCurrentPositionMs(status.positionMillis || 0);
                    setVideoDurationMs(status.durationMillis || 0);
                  }}
                />
                <BoundingBoxOverlay
                  detections={currentVideoBoxes}
                  containerSize={videoLayoutSize}
                  sourceSize={
                    videoNaturalSize.width && videoNaturalSize.height
                      ? videoNaturalSize
                      : videoLayoutSize
                  }
                  colorMap={modelColorMap}
                  labelMap={modelNameMap}
                />
              </View>
              <View style={styles.videoTimeRow}>
                <Text style={styles.videoTimeText}>
                  {(currentPositionMs / 1000).toFixed(1)}s / {(videoDurationMs / 1000).toFixed(1)}s
                </Text>
              </View>
            </>
          ) : (
            <View
              style={styles.imagePreviewWrap}
              onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                setImageLayoutSize({ width, height });
              }}
            >
              <Image
                source={{ uri: mediaUri }}
                style={styles.mediaPreview}
                resizeMode="contain"
                onLoad={(event) => {
                  const src = event.nativeEvent.source;
                  if (src?.width && src?.height) {
                    setImageNaturalSize({ width: src.width, height: src.height });
                  }
                }}
              />
              <BoundingBoxOverlay
                detections={imageDetections}
                containerSize={imageLayoutSize}
                sourceSize={imageNaturalSize}
                colorMap={modelColorMap}
                labelMap={modelNameMap}
              />
            </View>
          )}
        </View>
      )}

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
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
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
  videoPreviewWrap: {
    width: '100%',
    height: 250,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  imagePreviewWrap: {
    width: '100%',
    height: 250,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  videoTimeRow: { marginTop: 8, alignItems: 'flex-end' },
  videoTimeText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
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
