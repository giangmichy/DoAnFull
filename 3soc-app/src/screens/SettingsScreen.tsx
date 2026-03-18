import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../api';

export default function SettingsScreen() {
  const { user, logout, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'account' | 'password'>('account');
  const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => { refreshUser(); }, []);

  const handlePasswordChange = async () => {
    const { oldPassword, newPassword, confirmPassword } = passwordData;
    if (!oldPassword || !newPassword || !confirmPassword) {
      Alert.alert('Lỗi', 'Vui lòng điền đầy đủ thông tin');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Lỗi', 'Mật khẩu mới không khớp');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Lỗi', 'Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }
    setLoading(true);
    try {
      await apiClient.changePassword(oldPassword, newPassword);
      Alert.alert('Thành công', 'Đổi mật khẩu thành công');
      setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Đổi mật khẩu thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="settings-outline" size={28} color="#7c3aed" />
        <Text style={styles.headerTitle}>Cài đặt</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'account' && styles.tabActive]}
          onPress={() => setActiveTab('account')}
        >
          <Text style={[styles.tabText, activeTab === 'account' && styles.tabTextActive]}>Tài khoản</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'password' && styles.tabActive]}
          onPress={() => setActiveTab('password')}
        >
          <Text style={[styles.tabText, activeTab === 'password' && styles.tabTextActive]}>Mật khẩu</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'account' ? (
        <View style={styles.card}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarLargeText}>
                {user?.username?.substring(0, 2).toUpperCase() || 'U'}
              </Text>
            </View>
            <Text style={styles.profileName}>{user?.username || 'User'}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                {user?.role === 'admin' ? 'Quản trị viên' : 'Người dùng'}
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={18} color="#64748b" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Tên đăng nhập</Text>
              <Text style={styles.infoValue}>{user?.username || '-'}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={18} color="#64748b" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{user?.email || '-'}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={18} color="#64748b" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Ngày tạo</Text>
              <Text style={styles.infoValue}>
                {user?.created_at ? new Date(user.created_at).toLocaleDateString('vi-VN') : '-'}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#fff" />
            <Text style={styles.logoutBtnText}>Đăng xuất</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mật khẩu hiện tại</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Nhập mật khẩu hiện tại"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              value={passwordData.oldPassword}
              onChangeText={v => setPasswordData({ ...passwordData, oldPassword: v })}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mật khẩu mới</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Nhập mật khẩu mới"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              value={passwordData.newPassword}
              onChangeText={v => setPasswordData({ ...passwordData, newPassword: v })}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Xác nhận mật khẩu</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Nhập lại mật khẩu mới"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              value={passwordData.confirmPassword}
              onChangeText={v => setPasswordData({ ...passwordData, confirmPassword: v })}
            />
          </View>

          <TouchableOpacity style={styles.submitBtn} onPress={handlePasswordChange} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Đổi mật khẩu</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* App Info */}
      <View style={styles.appInfo}>
        <Text style={styles.appInfoText}>3SOC Detection v1.0.0</Text>
        <Text style={styles.appInfoText}>React Native + FastAPI</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#1e293b' },
  tabs: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  tabText: { fontSize: 14, color: '#64748b', fontWeight: '500' },
  tabTextActive: { color: '#7c3aed', fontWeight: '600' },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  profileHeader: { alignItems: 'center', marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  avatarLarge: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#ede9fe', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarLargeText: { fontSize: 24, fontWeight: '700', color: '#7c3aed' },
  profileName: { fontSize: 20, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  roleBadge: { backgroundColor: '#f3e8ff', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  roleBadgeText: { fontSize: 12, color: '#7c3aed', fontWeight: '600' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, color: '#94a3b8', marginBottom: 2 },
  infoValue: { fontSize: 15, color: '#1e293b', fontWeight: '500' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ef4444', borderRadius: 10, height: 48, gap: 8, marginTop: 20,
  },
  logoutBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 },
  textInput: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 14, height: 48, fontSize: 15, color: '#1e293b',
  },
  submitBtn: { backgroundColor: '#7c3aed', borderRadius: 10, height: 48, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  appInfo: { alignItems: 'center', marginTop: 24, gap: 4 },
  appInfoText: { fontSize: 12, color: '#94a3b8' },
});
