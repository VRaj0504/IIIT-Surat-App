import React from "react";
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle } from "react-native-svg";

// The CollegeGo logo, drawn as a vector so it is sharp at any size:
// a white "G" whose bar turns down into a mint "go" dot, on the blue → violet
// tile. Same drawing as the app icon (assets/icon.png).
export const BRAND = {
  blue: "#0A84FF",
  indigo: "#3D5CFF",
  violet: "#6A3DF5",
  mint: "#6CF0D8",
};

// Where the mint dot sits, as a fraction of the logo's size (used by the loader).
export const DOT_CENTER = { x: 0.5 + (784 - 512) * 1.12 / 1024, y: 0.5 + (690 - 512) * 1.12 / 1024 };
export const DOT_RADIUS = (52 * 1.12) / 1024;

export default function BrandMark({ size = 40, tile = true, dot = true }: { size?: number; tile?: boolean; dot?: boolean }) {
  const ink = tile ? "#FFFFFF" : "url(#cgInk)";
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id="cgTile" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={BRAND.blue} />
          <Stop offset="0.55" stopColor={BRAND.indigo} />
          <Stop offset="1" stopColor={BRAND.violet} />
        </LinearGradient>
        <LinearGradient id="cgInk" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={BRAND.blue} />
          <Stop offset="1" stopColor={BRAND.violet} />
        </LinearGradient>
      </Defs>
      {tile && <Rect width={1024} height={1024} rx={240} fill="url(#cgTile)" />}
      {/* scale(1.12) about the centre, matching the icon */}
      <Path
        d="M 671.8 344.7 A 250 250 0 1 0 653.3 697.8"
        transform="translate(512 512) scale(1.12) translate(-512 -512)"
        fill="none"
        stroke={ink}
        strokeWidth={96}
        strokeLinecap="round"
      />
      <Path
        d="M 606 512 H 784 V 668"
        transform="translate(512 512) scale(1.12) translate(-512 -512)"
        fill="none"
        stroke={ink}
        strokeWidth={96}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dot && (
        <Circle cx={784} cy={690} r={52} fill={BRAND.mint} transform="translate(512 512) scale(1.12) translate(-512 -512)" />
      )}
    </Svg>
  );
}
