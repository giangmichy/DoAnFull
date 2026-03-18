import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Alert, ActivityIndicator, RefreshControl, Modal, Image, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient, VideoFile, ViolationImage } from '../api';
import { BACKEND_BASE_URL } from '../config';

const PAGE_SIZE = 10;

export default function FilesScreen() {
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Detection modal state
  const [detectModalVisible, setDetectModalVisible] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [currentFileName, setCurrentFileName] = useState('');
  const [violations, setViolations] = useState<ViolationImage[]>([]);
  const [processedFrames, setProcessedFrames] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [selectedViolation, setSelectedViolation] = useState<ViolationImage | null>(null);
  const sseRef = React.useRef<AbortController | null>(null);

  const loadFiles = useCallback(async (targetPage = page) => {
    try {
      setLoading(true);
      const data = await apiClient.getFiles({ page: targetPage, pageSize: PAGE_SIZE, sortOrder });
      if (data.meta.total_pages > 0 && targetPage > data.meta.total_pages) {
        setPage(data.meta.total_pages);
        return;
      }
      setFiles(data.items);
      setTotalPages(data.meta.total_pages);
      setTotalFiles(data.meta.total);
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể tải danh sách file');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, sortOrder]);

  useEffect(() => { loadFiles(page); }, [page, sortOrder]);

  const handleDelete = (id: string) => {
    Alert.alert('Xác nhận', 'Bạn có chắc muốn xóa file này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa', style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.deleteFile(id);
            loadFiles(page);
          } catch (err: any) {
            Alert.alert('Lỗi', err.message);
          }
        },
      },
    ]);
  };

  const handleDetect = (fileId: string, fName: string) => {
    setCurrentFileName(fName);
    setViolations([]);
    setProcessedFrames(0);
    setTotalFrames(0);
    setSelectedViolation(null);
    setDetecting(true);
    setDetectModalVisible(true);

    const controller = new AbortController();
    sseRef.current = controller;

    const streamUrl = `${BACKEND_BASE_URL}/api/files/${fileId}/detect-stream`;

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
                const msg = JSON.parse(line.slice(6));
                if (msg.type === 'init' || msg.type === 'metadata') {
                  setTotalFrames(msg.total_frames || 0);
                } else if (msg.type === 'violation' && msg.data) {
                  setViolations(prev => [...prev, msg.data]);
                  setProcessedFrames(prev => Math.max(prev, msg.data.frame_number || 0));
                } else if (msg.type === 'complete') {
                  // done
                }
              } catch { /* skip */ }
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.warn('SSE error:', err);
      })
      .finally(() => setDetecting(false));
  };

  const closeDetectModal = () => {
    if (sseRef.current) {
      sseRef.current.abort();
      sseRef.current = null;
    }
    setDetectModalVisible(false);
    setDetecting(false);
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDuration = (sec?: number) => {
    if (!sec) return 'N/A';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m > 0 ? `${m}p ${s}s` : `${s}s`;
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const modelNameMap: Record<string, string> = {
    co3soc: 'Cờ 3 sọc',
    duongluoibo: 'Đường lưỡi bò',
    vnmap: 'Bản đồ VN',
  };

  const renderFileItem = ({ item, index }: { item: VideoFile; index: number }) => (
    <View style={styles.fileRow}>
      <View style={styles.fileInfo}>
        <View style={styles.fileNameRow}>
          <Ionicons name="videocam-outline" size={16} color="#64748b" />
          <Text style={styles.fileName} numberOfLines={1}>{item.filename}</Text>
        </View>
        <Text style={styles.fileMeta}>
          {formatSize(item.file_size)} · {formatDuration(item.duration)} · {item.owner?.username || 'N/A'}
        </Text>
        <Text style={styles.fileDate}>{formatDate(item.created_at)}</Text>
      </View>
      <View style={styles.fileActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleDetect(item.id, item.filename)}>
          <Ionicons name="scan-outline" size={18} color="#7c3aed" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => handleDelete(item.id)}>
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Quản lý file</Text>
        <Text style={styles.headerSub}>Tổng {totalFiles} file</Text>
      </View>

      {/* Sort */}
      <View style={styles.sortRow}>
        <TouchableOpacity
          style={[styles.sortBtn, sortOrder === 'desc' && styles.sortBtnActive]}
          onPress={() => { setSortOrder('desc'); setPage(1); }}
        >
          <Text style={[styles.sortText, sortOrder === 'desc' && styles.sortTextActive]}>Mới nhất</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortBtn, sortOrder === 'asc' && styles.sortBtnActive]}
          onPress={() => { setSortOrder('asc'); setPage(1); }}
        >
          <Text style={[styles.sortText, sortOrder === 'asc' && styles.sortTextActive]}>Cũ nhất</Text>
        </TouchableOpacity>
      </View>

      {/* File List */}
      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#7c3aed" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={files}
          renderItem={renderFileItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadFiles(page); }} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>Chưa có file nào</Text>
            </View>
          }
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <View style={styles.pagination}>
          <TouchableOpacity
            style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
            onPress={() => page > 1 && setPage(page - 1)}
            disabled={page <= 1}
          >
            <Ionicons name="chevron-back" size={18} color={page <= 1 ? '#cbd5e1' : '#7c3aed'} />
          </TouchableOpacity>
          <Text style={styles.pageText}>{page} / {totalPages}</Text>
          <TouchableOpacity
            style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
            onPress={() => page < totalPages && setPage(page + 1)}
            disabled={page >= totalPages}
          >
            <Ionicons name="chevron-forward" size={18} color={page >= totalPages ? '#cbd5e1' : '#7c3aed'} />
          </TouchableOpacity>
        </View>
      )}

      {/* Detection Modal */}
      <Modal visible={detectModalVisible} animationType="slide" onRequestClose={closeDetectModal}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>Kết quả: {currentFileName}</Text>
            <TouchableOpacity onPress={closeDetectModal}>
              <Ionicons name="close" size={24} color="#1e293b" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: '#fef2f2' }]}>
                <Text style={styles.statLabel}>Vi phạm</Text>
                <Text style={[styles.statValue, { color: '#dc2626' }]}>{violations.length}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#f0fdf4' }]}>
                <Text style={styles.statLabel}>Đã xử lý</Text>
                <Text style={[styles.statValue, { color: '#16a34a' }]}>{processedFrames}</Text>
              </View>
            </View>

            {detecting && (
              <View style={styles.detectingRow}>
                <ActivityIndicator size="small" color="#7c3aed" />
                <Text style={styles.detectingText}>Đang phân tích...</Text>
              </View>
            )}

            {/* Violation Grid */}
            {violations.length > 0 ? (
              <View style={styles.violationGrid}>
                {violations.map((v, idx) => {
                  const imgUrl = v.image_path?.startsWith('http')
                    ? v.image_path
                    : `${BACKEND_BASE_URL}${v.image_path}`;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={styles.violationGridItem}
                      onPress={() => setSelectedViolation(v)}
                    >
                      <Image source={{ uri: imgUrl }} style={styles.violationGridImage} resizeMode="cover" />
                      <View style={styles.violationGridBadge}>
                        <Text style={styles.violationGridBadgeText}>{v.detections?.length || 0}</Text>
                      </View>
                      <Text style={styles.violationGridTime}>{(v.timestamp / 1000).toFixed(1)}s</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : !detecting ? (
              <View style={styles.noViolation}>
                <Text style={styles.noViolationText}>✓ Không phát hiện vi phạm</Text>
              </View>
            ) : null}

            {/* Selected Violation Detail */}
            {selectedViolation && (
              <View style={styles.detailCard}>
                <Text style={styles.detailTitle}>Chi tiết vi phạm</Text>
                <Image
                  source={{
                    uri: selectedViolation.image_path?.startsWith('http')
                      ? selectedViolation.image_path
                      : `${BACKEND_BASE_URL}${selectedViolation.image_path}`,
                  }}
                  style={styles.detailImage}
                  resizeMode="contain"
                />
                <View style={styles.detailStats}>
                  <Text style={styles.detailStatText}>Phát hiện: {selectedViolation.detections?.length || 0}</Text>
                  <Text style={styles.detailStatText}>Thời gian: {(selectedViolation.timestamp / 1000).toFixed(2)}s</Text>
                </View>
                {selectedViolation.detections?.map((d: any, i: number) => (
                  <View key={i} style={styles.detailDetRow}>
                    <Text style={styles.detailDetLabel}>{modelNameMap[d.label] || d.label}</Text>
                    <Text style={styles.detailDetConf}>{((d.confidence ?? d.score ?? 0) * 100).toFixed(1)}%</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  headerSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  sortRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f1f5f9' },
  sortBtnActive: { backgroundColor: '#7c3aed' },
  sortText: { fontSize: 13, color: '#64748b' },
  sortTextActive: { color: '#fff', fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  fileInfo: { flex: 1 },
  fileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  fileName: { fontSize: 14, fontWeight: '600', color: '#1e293b', flex: 1 },
  fileMeta: { fontSize: 12, color: '#64748b' },
  fileDate: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  fileActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center',
  },
  deleteBtn: { backgroundColor: '#fef2f2' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: '#94a3b8' },
  pagination: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  pageBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  pageBtnDisabled: { opacity: 0.4 },
  pageText: { fontSize: 14, color: '#475569', fontWeight: '500' },
  // Modal
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    paddingTop: 50,
  },
  modalTitle: { fontSize: 16, fontWeight: '600', color: '#1e293b', flex: 1, marginRight: 12 },
  modalBody: { flex: 1, padding: 16 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: { flex: 1, borderRadius: 10, padding: 12 },
  statLabel: { fontSize: 12, color: '#64748b' },
  statValue: { fontSize: 24, fontWeight: '700', marginTop: 4 },
  detectingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  detectingText: { fontSize: 13, color: '#7c3aed' },
  violationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  violationGridItem: {
    width: '31%' as any,
    borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0',
  },
  violationGridImage: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#e2e8f0' },
  violationGridBadge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: '#ef4444', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1,
  },
  violationGridBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  violationGridTime: { textAlign: 'center', fontSize: 11, color: '#64748b', paddingVertical: 4 },
  noViolation: { padding: 24, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' },
  noViolationText: { fontSize: 14, color: '#64748b' },
  detailCard: {
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginTop: 8, borderWidth: 1, borderColor: '#e2e8f0',
  },
  detailTitle: { fontSize: 14, fontWeight: '600', color: '#1e293b', marginBottom: 8 },
  detailImage: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#000', marginBottom: 8 },
  detailStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  detailStatText: { fontSize: 13, color: '#475569', fontWeight: '500' },
  detailDetRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  detailDetLabel: { fontSize: 13, color: '#334155', fontWeight: '500' },
  detailDetConf: { fontSize: 13, color: '#64748b' },
});
