import React, { useState } from 'react';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

export default function AuthNavigator() {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');

  if (mode === 'signup') {
    return <SignUpScreen onNavigateToLogin={() => setMode('login')} />;
  }
  if (mode === 'forgot') {
    return <ForgotPasswordScreen onNavigateToLogin={() => setMode('login')} />;
  }
  return (
    <LoginScreen onNavigateToSignUp={() => setMode('signup')} onNavigateToForgotPassword={() => setMode('forgot')} />
  );
}
