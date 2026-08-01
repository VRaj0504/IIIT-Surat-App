import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import AuthNavigator from './src/navigation/AuthNavigator';
import FacultyNavigator from './src/navigation/FacultyNavigator';
import CompleteProfileScreen from './src/screens/auth/CompleteProfileScreen';
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
  // Signed in (via Google) but no Firestore profile doc yet — this only
  // happens on a first-time Google sign-in, since email signUp always
  // creates the profile doc before it ever settles into this state.
  if (!profile) return <CompleteProfileScreen />;
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