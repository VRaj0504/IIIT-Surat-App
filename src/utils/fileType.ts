export function guessMimeType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return "application/octet-stream";
  }
}

// Only images render correctly inside the in-app WebView preview (browsers/
// WebViews natively decode image data URIs). PDFs and everything else need
// to go through the OS's own viewer via expo-sharing instead — Android's
// WebView has no built-in PDF renderer, so a data: URI PDF just shows a
// blank page there even though the exact same approach works on iOS.
export function isPreviewableInWebView(name: string): boolean {
  return guessMimeType(name).startsWith("image/");
}