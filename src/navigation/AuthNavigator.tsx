import React, { useState } from 'react';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

// Plain conditional render (not React Navigation), so give it a gentle
// crossfade between the three sign-in screens.
export default function AuthNavigator() {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  return (
    <Animated.View key={mode} entering={FadeIn.duration(260)} exiting={FadeOut.duration(160)} style={{ flex: 1 }}>
      {mode === 'signup' ? (
        <SignUpScreen onNavigateToLogin={() => setMode('login')} />
      ) : mode === 'forgot' ? (
        <ForgotPasswordScreen onNavigateToLogin={() => setMode('login')} />
      ) : (
        <LoginScreen onNavigateToSignUp={() => setMode('signup')} onNavigateToForgotPassword={() => setMode('forgot')} />
      )}
    </Animated.View>
  );
}
