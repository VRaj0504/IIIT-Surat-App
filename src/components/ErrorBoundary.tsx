import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { colors } from "../theme/theme";

type Props = { children: React.ReactNode };
type State = { failed: boolean; attempt: number };

/**
 * Catches a crash in any screen and shows a retry page instead of a blank screen.
 * "Try again" remounts everything under it.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[ErrorBoundary] screen crashed:", error);
  }

  retry = () => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));

  render() {
    if (!this.state.failed) return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.background }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: 8, textAlign: "center" }}>
          Something went wrong
        </Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", marginBottom: 20 }}>
          This screen couldn't open. Your data is safe. Try again, and if it keeps happening, close and reopen the app.
        </Text>
        <TouchableOpacity
          onPress={this.retry}
          accessibilityRole="button"
          style={{ backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 12 }}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
