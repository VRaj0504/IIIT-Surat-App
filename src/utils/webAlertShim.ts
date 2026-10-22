import { Alert, Platform, AlertButton } from "react-native";

if (Platform.OS === "web") {
  const g = globalThis as any;
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join("\n\n");
    if (!buttons || buttons.length <= 1) {
      g.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }
    const cancel = buttons.find((b) => b.style === "cancel");
    const actions = buttons.filter((b) => b !== cancel);
    const confirmed = g.confirm(text);
    const chosen = confirmed ? actions[0] : cancel ?? actions[actions.length - 1];
    chosen?.onPress?.();
  };
}
