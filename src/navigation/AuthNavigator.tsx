import React, { useState } from 'react';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';

export default function AuthNavigator() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  return mode === 'login' ? (
    <LoginScreen onNavigateToSignUp={() => setMode('signup')} />
  ) : (
    <SignUpScreen onNavigateToLogin={() => setMode('login')} />
  );
}
