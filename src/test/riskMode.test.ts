import { expect, test } from "vitest";
import { PROTECTION_MODES, PROTECTION_MODE_SETTING_SUFFIX, resolveProtectionMode } from "../../server/risk/mode.js";

test("env kill switch and explicit mode win; missing setting is shadow", () => {
  expect(PROTECTION_MODES).toEqual(["off", "shadow", "active"]);
  expect(PROTECTION_MODE_SETTING_SUFFIX).toBe("order_protection_mode");
  expect(resolveProtectionMode({ envMode: "disabled", settingMode: "active" })).toBe("off");
  expect(resolveProtectionMode({ envMode: "off", settingMode: "active" })).toBe("off");
  expect(resolveProtectionMode({ envMode: "active", settingMode: "shadow" })).toBe("active");
  expect(resolveProtectionMode({ envMode: "shadow", settingMode: "active" })).toBe("shadow");
  expect(resolveProtectionMode({ envMode: "", settingMode: "active" })).toBe("active");
  expect(resolveProtectionMode({ envMode: "unknown", settingMode: "unknown" })).toBe("shadow");
});
