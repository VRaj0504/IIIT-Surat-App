import React, { useEffect, useState } from "react";
import { View, Image, StyleSheet, TouchableOpacity, Modal, Pressable } from "react-native";
import { complaintPhotoUrl } from "../firebase/complaintService";
import { colors } from "../theme/theme";

export default function ComplaintPhotos({ paths }: { paths?: string[] | null }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!paths?.length) return;
    let live = true;
    Promise.all(paths.map((p) => complaintPhotoUrl(p).catch(() => null))).then((list) => {
      if (live) setUrls(list.filter((u): u is string => !!u));
    });
    return () => {
      live = false;
    };
  }, [paths?.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!urls.length) return null;
  return (
    <>
      <View style={styles.row}>
        {urls.map((u) => (
          <TouchableOpacity key={u} onPress={() => setOpen(u)} activeOpacity={0.85}>
            <Image source={{ uri: u }} style={styles.thumb} />
          </TouchableOpacity>
        ))}
      </View>
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.viewer} onPress={() => setOpen(null)}>
          {open && <Image source={{ uri: open }} style={styles.full} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, marginTop: 8 },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: colors.surfaceAlt },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" },
  full: { width: "100%", height: "80%" },
});
