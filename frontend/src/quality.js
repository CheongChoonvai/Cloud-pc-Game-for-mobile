// Stream quality presets. `params: null` means "use the PC's .env defaults".
// Higher presets cost more encoding time (x264 software) and WiFi bandwidth.
export const QUALITY_PRESETS = {
  auto: {
    label: 'Default',
    detail: "PC settings",
    params: null,
  },
  fast: {
    label: 'Fast',
    detail: '360p · 30fps',
    params: { width: 640, height: 360, fps: 30, bitrate: 2_000_000 },
  },
  balanced: {
    label: 'Balanced',
    detail: '480p · 60fps',
    params: { width: 854, height: 480, fps: 60, bitrate: 4_000_000 },
  },
  hd: {
    label: 'HD',
    detail: '720p · 60fps',
    params: { width: 1280, height: 720, fps: 60, bitrate: 8_000_000 },
  },
  fullhd: {
    label: 'Full HD',
    detail: '1080p · 30fps',
    params: { width: 1920, height: 1080, fps: 30, bitrate: 12_000_000 },
  },
};

export const getQualityParams = (key) => QUALITY_PRESETS[key]?.params ?? null;
