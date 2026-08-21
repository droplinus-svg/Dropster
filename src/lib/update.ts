import { BUILD_ID } from "../config";

// Prueft gegen die frisch von Netlify ausgelieferte version.json, ob eine
// neuere Version deployt wurde als die gerade laufende.
export async function isUpdateAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`/version.json?ts=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { build?: string };
    return !!data.build && data.build !== BUILD_ID;
  } catch {
    return false;
  }
}
