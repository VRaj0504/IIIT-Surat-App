import React from "react";
import { Image } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getClubIcon } from "../data/clubIcons";

/** A club's logo when we have one, otherwise its coloured icon. Sits inside the existing round icon wrappers. */
export default function ClubGlyph({ name, size }: { name: string; size: number }) {
  const { icon, color, image } = getClubIcon(name);
  if (image) {
    const d = Math.round(size * 1.75);
    return <Image source={image} style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: "#FFFFFF" }} resizeMode="contain" accessibilityIgnoresInvertColors />;
  }
  return <Ionicons name={icon} size={size} color={color} />;
}
