import React, { useState } from 'react';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

export default function AuthNavigator() {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');

  // Previously an instant, jarring swap between these three screens —
  // this is a plain conditional render, not React Navigation, so it
  // never got the same transition treatment as the rest of the app. A
  // simple crossfade here matters disproportionately since login/signup
  // is the very first thing any new user experiences.
  return (
    <Animated.View key={mode} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={{ flex: 1 }}>
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
