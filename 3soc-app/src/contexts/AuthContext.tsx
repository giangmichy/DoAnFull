import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient, User } from '../api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const savedToken = await apiClient.loadToken();
      if (savedToken) {
        setToken(savedToken);
        try {
          const me = await apiClient.getMe();
          setUser(me);
        } catch {
          await apiClient.clearToken();
          setToken(null);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiClient.login({ username, password });
    setToken(res.access_token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await apiClient.clearToken();
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await apiClient.getMe();
      setUser(me);
    } catch { /* ignore */ }
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!token && !!user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
