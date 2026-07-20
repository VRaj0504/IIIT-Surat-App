import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '../../theme/theme';
import { useAuth, Role } from '../../context/AuthContext';

type Props = {
  onNavigateToLogin: () => void;
};

function friendlyError(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export default function SignUpScreen({ onNavigateToLogin }: Props) {
  const { signUp } = useAuth();
  const [role, setRole] = useState<Role>('student');
  const [name, setName] = useState('');
  const [enrollmentNumber, setEnrollmentNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || !password) {
      setError('Fill in all required fields.');
      return;
    }
    if (role === 'student' && !enrollmentNumber.trim()) {
      setError('Enrollment number is required for students.');
      return;
    }
    if (password.length < 6) {
      setError('Password should be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await signUp({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        enrollmentNumber: role === 'student' ? enrollmentNumber.trim() : undefined,
      });
    } catch (e: any) {
      // Our own roster-rejection error has no `.code` (it's not a Firebase
      // error) — show its message directly in that case, otherwise fall
      // back to the Firebase-specific friendly messages.
      setError(e?.code ? friendlyError(e.code) : e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>IIIT Surat</Text>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Join as a student or faculty member</Text>

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.roleToggle}>
            <TouchableOpacity
              style={[styles.roleBtn, role === 'student' && styles.roleBtnActive]}
              onPress={() => setRole('student')}
            >
              <Text style={[styles.roleBtnText, role === 'student' && styles.roleBtnTextActive]}>Student</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleBtn, role === 'faculty' && styles.roleBtnActive]}
              onPress={() => setRole('faculty')}
            >
              <Text style={[styles.roleBtnText, role === 'faculty' && styles.roleBtnTextActive]}>Faculty</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
          />

          {role === 'student' && (
            <>
              <Text style={styles.label}>Enrollment Number</Text>
              <TextInput
                style={styles.input}
                placeholder="UG25CSE114"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="characters"
                value={enrollmentNumber}
                onChangeText={setEnrollmentNumber}
              />
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@iiitsurat.ac.in"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity style={styles.primaryBtn} onPress={handleSignUp} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Sign Up</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={onNavigateToLogin} style={styles.linkBtn}>
            <Text style={styles.linkText}>Already have an account? <Text style={styles.linkTextBold}>Log in</Text></Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center' },
  brand: { ...typography.caption, color: colors.primary, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.xs },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
  error: {
    color: colors.danger,
    backgroundColor: '#FCEAEB',
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
    ...typography.caption,
  },
  roleToggle: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 4, marginBottom: spacing.sm },
  roleBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  roleBtnActive: { backgroundColor: colors.primary },
  roleBtnText: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  roleBtnTextActive: { color: '#fff' },
  label: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  linkBtn: { marginTop: spacing.lg, alignItems: 'center' },
  linkText: { ...typography.body, color: colors.textSecondary },
  linkTextBold: { color: colors.primary, fontWeight: '700' },
});
