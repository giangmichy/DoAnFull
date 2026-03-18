import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import DetectionScreen from './src/screens/DetectionScreen';
import FilesScreen from './src/screens/FilesScreen';
import UsersScreen from './src/screens/UsersScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'Phát hiện') iconName = focused ? 'scan' : 'scan-outline';
          else if (route.name === 'Files') iconName = focused ? 'folder' : 'folder-outline';
          else if (route.name === 'Người dùng') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === 'Cài đặt') iconName = focused ? 'settings' : 'settings-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#7c3aed',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#f1f5f9',
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: {
          backgroundColor: '#7c3aed',
        },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      })}
    >
      <Tab.Screen name="Phát hiện" component={DetectionScreen} options={{ headerTitle: 'AI Detection System' }} />
      <Tab.Screen name="Files" component={FilesScreen} options={{ headerTitle: 'Quản lý file' }} />
      {isAdmin && (
        <Tab.Screen name="Người dùng" component={UsersScreen} options={{ headerTitle: 'Quản lý người dùng' }} />
      )}
      <Tab.Screen name="Cài đặt" component={SettingsScreen} options={{ headerTitle: 'Cài đặt' }} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e1b4b' }}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <RootNavigator />
        <StatusBar style="light" />
      </NavigationContainer>
    </AuthProvider>
  );
}
