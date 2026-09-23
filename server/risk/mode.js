export const PROTECTION_MODES = Object.freeze(["off", "shadow", "active"]);
export const PROTECTION_MODE_SETTING_SUFFIX = "order_protection_mode";

export function resolveProtectionMode({ envMode, settingMode }) {
  const env = typeof envMode === "string" ? envMode.trim().toLowerCase() : "";
  if (env === "off" || env === "disabled") return "off";
  if (env === "shadow" || env === "active") return env;
  const setting = typeof settingMode === "string" ? settingMode.trim().toLowerCase() : "";
  return PROTECTION_MODES.includes(setting) ? setting : "shadow";
}
