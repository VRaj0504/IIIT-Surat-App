import React from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, createNavigationContainerRef, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import AuthNavigator from './src/navigation/AuthNavigator';
import CompleteProfileScreen from './src/screens/auth/CompleteProfileScreen';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { colors, isDark } from './src/theme/theme';
import WebShell from './src/components/WebShell';
import { linking, formatDocumentTitle } from './src/navigation/linking';
import LoadingSpinner from "./src/components/LoadingSpinner";
import Constants from 'expo-constants';

const navigationRef = createNavigationContainerRef<any>();

// React Navigation paints its own card/background colours (visible during
// screen transitions); match them to the app theme so dark mode never
// flashes white between screens.
const navTheme = {
  ...(isDark ? DarkTheme : DefaultTheme),
  colors: {
    ...(isDark ? DarkTheme : DefaultTheme).colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.danger,
  },
};

function Gate() {
  const { user, profile, initializing, profileLoading, profileLoadFailed, retryProfileLoad, logOut } = useAuth();

  if (initializing || (user && profileLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <LoadingSpinner large label="Opening CollegeGo…" />
      </View>
    );
  }

  if (!user) return <AuthNavigator />;

  // The profile fetch FAILED (offline, timeout). This is not the same as
  // "no profile yet" — showing CompleteProfileScreen here would treat an
  // existing user like a first-time sign-in.
  if (!profile && profileLoadFailed) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
          padding: 24,
        }}
      >
        <Text style={{ fontSize: 16, textAlign: 'center', marginBottom: 16, color: colors.textPrimary }}>
          Couldn't load your profile. Check your internet connection and try again.
        </Text>
        <TouchableOpacity
          onPress={retryProfileLoad}
          style={{ backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 12 }}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: '600' }}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => logOut()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.primary }}>Log out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Signed in (via Google) but no Firestore profile doc yet — this only
  // happens on a first-time Google sign-in.
  if (!profile) return <CompleteProfileScreen />;
  return <RootNavigator/>;
}

export default function App() {
  const [currentRoute, setCurrentRoute] = React.useState<string | undefined>(undefined);
  const syncRoute = () => setCurrentRoute(navigationRef.getCurrentRoute()?.name);

  // Tapping a notification that carries `data.screen` (e.g. an SOS alert →
  // "SosAlerts") opens that screen — also when the tap launched the app.
  React.useEffect(() => {
    // Never load expo-notifications in Expo Go (it throws on import on
    // Android since SDK 53 — same rule as src/firebase/pushService.ts).
    if (Platform.OS === 'web' || Constants.executionEnvironment === 'storeClient') return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications');
    const open = (data: any) => {
      const screen = data?.screen;
      if (typeof screen !== 'string') return;
      const go = () => navigationRef.navigate(screen as never);
      if (navigationRef.isReady()) go();
      else setTimeout(go, 800);
    };
    Notifications.getLastNotificationResponseAsync()
      .then((r: any) => r && open(r.notification.request.content.data))
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((r: any) => open(r.notification.request.content.data));
    return () => sub.remove();
  }, []);

  return (
    <AuthProvider>
      <SafeAreaProvider>
        <WebShell navigationRef={navigationRef} currentRoute={currentRoute}>
          <NavigationContainer
            ref={navigationRef}
            theme={navTheme}
            linking={linking}
            documentTitle={{ formatter: formatDocumentTitle }}
            onReady={syncRoute}
            onStateChange={syncRoute}
          >
            <Gate />
            <StatusBar style={isDark ? "light" : "dark"} />
          </NavigationContainer>
        </WebShell>
      </SafeAreaProvider>
    </AuthProvider>
  );
}
