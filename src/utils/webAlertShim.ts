import { Alert, Platform, AlertButton } from "react-native";

// react-native-web ships Alert.alert as an EMPTY function, so on the web
// build every confirmation, error and success message in the app would
// silently disappear. This maps it onto the browser's own dialogs:
//   • 0–1 buttons  -> window.alert, then runs that button's onPress
//   • 2+ buttons   -> window.confirm: OK runs the first non-cancel button,
//                     Cancel runs the "cancel" button (or the last one)
// (A dialog with three real choices collapses to those two outcomes.)
// Imported first thing in index.ts; does nothing on Android/iOS.
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
