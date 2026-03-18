import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Alert, ActivityIndicator, RefreshControl, Modal, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient, User, UserCreate, UserUpdate } from '../api';

const PAGE_SIZE = 10;

export default function UsersScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Form modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserCreate>({ username: '', email: '', password: '', role: 'user' });
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async (targetPage = page) => {
    try {
      setLoading(true);
      const data = await apiClient.getUsers({ page: targetPage, pageSize: PAGE_SIZE, sortOrder });
      if (data.meta.total_pages > 0 && targetPage > data.meta.total_pages) {
        setPage(data.meta.total_pages);
        return;
      }
      setUsers(data.items);
      setTotalPages(data.meta.total_pages);
      setTotalUsers(data.meta.total);
    } catch (err: any) {
      Alert.alert('Lỗi', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, sortOrder]);

  useEffect(() => { loadUsers(page); }, [page, sortOrder]);

  const openCreate = () => {
    setEditingUser(null);
    setFormData({ username: '', email: '', password: '', role: 'user' });
    setModalVisible(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setFormData({ username: user.username, email: user.email, password: '', role: user.role });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (!formData.username || !formData.email) {
      Alert.alert('Lỗi', 'Vui lòng điền đầy đủ thông tin');
      return;
    }
    if (!editingUser && !formData.password) {
      Alert.alert('Lỗi', 'Vui lòng nhập mật khẩu');
      return;
    }
    setSaving(true);
    try {
      if (editingUser) {
        const payload: UserUpdate = { username: formData.username, email: formData.email, role: formData.role };
        if (formData.password.trim()) payload.password = formData.password;
        await apiClient.updateUser(editingUser.id, payload);
      } else {
        await apiClient.register(formData);
      }
      setModalVisible(false);
      loadUsers(page);
    } catch (err: any) {
      Alert.alert('Lỗi', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert('Xác nhận', 'Bạn có chắc muốn xóa user này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa', style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.deleteUser(id);
            loadUsers(page);
          } catch (err: any) {
            Alert.alert('Lỗi', err.message);
          }
        },
      },
    ]);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const renderUserItem = ({ item }: { item: User }) => (
    <View style={styles.userRow}>
      <View style={styles.userInfo}>
        <View style={styles.userNameRow}>
          <View style={[styles.avatar, item.role === 'admin' && styles.avatarAdmin]}>
            <Text style={styles.avatarText}>{item.username.substring(0, 2).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{item.username}</Text>
            <Text style={styles.userEmail}>{item.email}</Text>
          </View>
        </View>
        <View style={styles.userMeta}>
          <View style={[styles.roleBadge, item.role === 'admin' ? styles.roleAdmin : styles.roleUser]}>
            {item.role === 'admin' && <Ionicons name="shield" size={10} color="#7c3aed" />}
            <Text style={[styles.roleText, item.role === 'admin' ? styles.roleTextAdmin : styles.roleTextUser]}>
              {item.role}
            </Text>
          </View>
          <View style={[styles.statusBadge, item.is_active ? styles.statusActive : styles.statusInactive]}>
            <Text style={[styles.statusText, item.is_active ? styles.statusTextActive : styles.statusTextInactive]}>
              {item.is_active ? 'Active' : 'Inactive'}
            </Text>
          </View>
          <Text style={styles.userDate}>{formatDate(item.created_at)}</Text>
        </View>
      </View>
      <View style={styles.userActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)}>
          <Ionicons name="create-outline" size={18} color="#7c3aed" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => handleDelete(item.id)}>
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Quản lý người dùng</Text>
          <Text style={styles.headerSub}>Tổng {totalUsers} người dùng</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Thêm</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#7c3aed" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={users}
          renderItem={renderUserItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadUsers(page); }} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>Chưa có người dùng</Text>
            </View>
          }
        />
      )}

      {totalPages > 1 && (
        <View style={styles.pagination}>
          <TouchableOpacity style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]} onPress={() => page > 1 && setPage(page - 1)} disabled={page <= 1}>
            <Ionicons name="chevron-back" size={18} color={page <= 1 ? '#cbd5e1' : '#7c3aed'} />
          </TouchableOpacity>
          <Text style={styles.pageText}>{page} / {totalPages}</Text>
          <TouchableOpacity style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]} onPress={() => page < totalPages && setPage(page + 1)} disabled={page >= totalPages}>
            <Ionicons name="chevron-forward" size={18} color={page >= totalPages ? '#cbd5e1' : '#7c3aed'} />
          </TouchableOpacity>
        </View>
      )}

      {/* Create/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingUser ? 'Chỉnh sửa' : 'Thêm người dùng'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={24} color="#1e293b" />
            </TouchableOpacity>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.label}>Username</Text>
            <TextInput style={styles.textInput} value={formData.username} onChangeText={v => setFormData({ ...formData, username: v })} autoCapitalize="none" />

            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.textInput} value={formData.email} onChangeText={v => setFormData({ ...formData, email: v })} keyboardType="email-address" autoCapitalize="none" />

            <Text style={styles.label}>Mật khẩu {editingUser ? '(để trống nếu không đổi)' : ''}</Text>
            <TextInput style={styles.textInput} value={formData.password} onChangeText={v => setFormData({ ...formData, password: v })} secureTextEntry />

            <Text style={styles.label}>Vai trò</Text>
            <View style={styles.roleSelector}>
              <TouchableOpacity
                style={[styles.roleSelectorBtn, formData.role === 'user' && styles.roleSelectorActive]}
                onPress={() => setFormData({ ...formData, role: 'user' })}
              >
                <Text style={[styles.roleSelectorText, formData.role === 'user' && styles.roleSelectorTextActive]}>User</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleSelectorBtn, formData.role === 'admin' && styles.roleSelectorActive]}
                onPress={() => setFormData({ ...formData, role: 'admin' })}
              >
                <Text style={[styles.roleSelectorText, formData.role === 'admin' && styles.roleSelectorTextActive]}>Admin</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>{editingUser ? 'Cập nhật' : 'Tạo mới'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  headerSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#7c3aed', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, gap: 4 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
  userRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10,
    padding: 12, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 2, elevation: 1,
  },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },
  avatarAdmin: { backgroundColor: '#ede9fe' },
  avatarText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  userName: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  userEmail: { fontSize: 12, color: '#64748b' },
  userMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 46 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  roleAdmin: { backgroundColor: '#f3e8ff' },
  roleUser: { backgroundColor: '#f1f5f9' },
  roleText: { fontSize: 11, fontWeight: '600' },
  roleTextAdmin: { color: '#7c3aed' },
  roleTextUser: { color: '#64748b' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusActive: { backgroundColor: '#f0fdf4' },
  statusInactive: { backgroundColor: '#fef2f2' },
  statusText: { fontSize: 11, fontWeight: '600' },
  statusTextActive: { color: '#16a34a' },
  statusTextInactive: { color: '#dc2626' },
  userDate: { fontSize: 11, color: '#94a3b8' },
  userActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  deleteBtn: { backgroundColor: '#fef2f2' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: '#94a3b8' },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  pageBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  pageBtnDisabled: { opacity: 0.4 },
  pageText: { fontSize: 14, color: '#475569', fontWeight: '500' },
  // Modal
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingTop: 50 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#1e293b' },
  modalBody: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6, marginTop: 12 },
  textInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, height: 44, fontSize: 15, color: '#1e293b' },
  roleSelector: { flexDirection: 'row', gap: 8 },
  roleSelectorBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center' },
  roleSelectorActive: { backgroundColor: '#7c3aed' },
  roleSelectorText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  roleSelectorTextActive: { color: '#fff' },
  submitBtn: { backgroundColor: '#7c3aed', borderRadius: 10, height: 48, justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
