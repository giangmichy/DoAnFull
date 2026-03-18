import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from './config';

// Types
export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface UserCreate {
  username: string;
  email: string;
  password: string;
  role?: string;
}

export interface UserUpdate {
  username?: string;
  email?: string;
  password?: string;
  role?: string;
  is_active?: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export type SortOrder = 'asc' | 'desc';

export interface VideoFile {
  id: string;
  filename: string;
  filepath: string;
  user_id?: number;
  file_size?: number;
  duration?: number;
  status: string;
  created_at: string;
  owner?: { id: number; username: string; email: string };
}

export interface DetectionBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  label?: string;
  model?: string;
  confidence?: number;
}

export interface ViolationImage {
  frame_number: number;
  timestamp: number;
  image_path: string;
  detections: DetectionBox[];
}

export interface DetectionResponse {
  cached: any;
  detection_id: string;
  total_frames: number;
  processed_frames: number;
  violation_count?: number;
  violations: ViolationImage[];
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  confidence: number;
}

const TOKEN_KEY = 'access_token';

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async loadToken(): Promise<string | null> {
    try {
      this.token = await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      this.token = null;
    }
    return this.token;
  }

  async setToken(token: string) {
    this.token = token;
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }

  async clearToken() {
    this.token = null;
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }

  getToken() {
    return this.token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    return headers;
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    return headers;
  }

  // Auth
  async login(data: LoginRequest): Promise<TokenResponse> {
    const res = await fetch(`${this.baseUrl}/users/login`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Đăng nhập thất bại');
    }
    const result: TokenResponse = await res.json();
    await this.setToken(result.access_token);
    return result;
  }

  async getMe(): Promise<User> {
    const res = await fetch(`${this.baseUrl}/users/me`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Unauthorized');
    return res.json();
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/users/change-password`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Đổi mật khẩu thất bại');
    }
  }

  // Users (admin)
  async getUsers(params: { page?: number; pageSize?: number; sortOrder?: SortOrder } = {}): Promise<PaginatedResponse<User>> {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', String(params.page));
    if (params.pageSize) sp.set('page_size', String(params.pageSize));
    if (params.sortOrder) sp.set('sort_order', params.sortOrder);
    const q = sp.toString();
    const res = await fetch(`${this.baseUrl}/users${q ? `?${q}` : ''}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
  }

  async register(data: UserCreate): Promise<User> {
    const res = await fetch(`${this.baseUrl}/users/register`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Tạo user thất bại');
    }
    return res.json();
  }

  async updateUser(id: number, data: UserUpdate): Promise<User> {
    const res = await fetch(`${this.baseUrl}/users/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Cập nhật thất bại');
    }
    return res.json();
  }

  async deleteUser(id: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/users/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Xóa user thất bại');
  }

  // Files
  async getFiles(params: { page?: number; pageSize?: number; sortOrder?: SortOrder } = {}): Promise<PaginatedResponse<VideoFile>> {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', String(params.page));
    if (params.pageSize) sp.set('page_size', String(params.pageSize));
    if (params.sortOrder) sp.set('sort_order', params.sortOrder);
    const q = sp.toString();
    const res = await fetch(`${this.baseUrl}/files${q ? `?${q}` : ''}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch files');
    return res.json();
  }

  async uploadFile(fileUri: string, fileName: string, videoId: string): Promise<VideoFile> {
    const formData = new FormData();
    formData.append('file', { uri: fileUri, name: fileName, type: 'video/mp4' } as any);
    formData.append('video_id', videoId);
    const res = await fetch(`${this.baseUrl}/files/upload`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Upload thất bại');
    }
    return res.json();
  }

  async deleteFile(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/files/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Xóa file thất bại');
  }

  async detectImage(fileUri: string, fileName: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', { uri: fileUri, name: fileName, type: 'image/jpeg' } as any);
    const res = await fetch(`${this.baseUrl}/files/detect-image`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Detect thất bại');
    }
    return res.json();
  }
}

export const apiClient = new ApiClient();
