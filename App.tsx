import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import AuthNavigator from './src/navigation/AuthNavigator';
import FacultyNavigator from './src/navigation/FacultyNavigator';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { colors } from './src/theme/theme';

function Gate() {
  const { user, profile, initializing, profileLoading } = useAuth();

  if (initializing || (user && profileLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) return <AuthNavigator />;
  return <RootNavigator/>;
}

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaProvider>
        <NavigationContainer>
          <Gate />
          <StatusBar style="dark" />
        </NavigationContainer>
      </SafeAreaProvider>
    </AuthProvider>
  );
}
