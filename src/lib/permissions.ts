/**
 * 카메라 권한 추상화 — iOS/AOS 차이 흡수.
 *
 * - iOS: 토스 앱 자체의 카메라 권한이 켜져 있어야 미니앱에서도 사용 가능
 * - Android: WebView 카메라 권한 별도 처리 가능성 (D1 검증)
 */

export type CameraPermissionState = "granted" | "denied" | "prompt";

interface PermissionsApi {
  query: (descriptor: { name: PermissionName | "camera" }) => Promise<{
    state: CameraPermissionState;
  }>;
}

declare global {
  interface Navigator {
    permissions?: PermissionsApi;
  }
}

export async function checkCameraPermission(): Promise<CameraPermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions) {
    return "prompt";
  }
  try {
    const result = await navigator.permissions.query({ name: "camera" });
    return result.state;
  } catch {
    // Safari 일부 버전 — Permissions API 가 'camera' 미지원
    return "prompt";
  }
}

export async function requestCameraStream(): Promise<MediaStream> {
  // 후면 카메라 우선. iOS 일부 버전에서 무시될 수 있어 fallback 처리.
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: 1920, height: 1080 },
      audio: false,
    });
  } catch (e) {
    // facingMode 미지원 → 기본 카메라
    if (e instanceof DOMException && e.name === "OverconstrainedError") {
      return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    throw e;
  }
}

export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

/**
 * captureFrame — video element 의 현재 프레임을 canvas 로 캡처.
 * width/height 는 video 의 실제 stream 해상도를 따름.
 */
export function captureFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Portrait lock — DESIGN.md Section 11 명시.
 * 분석 정확도를 위해 카메라/분석 화면은 portrait 강제.
 */
export async function lockPortraitOrientation(): Promise<void> {
  if (
    typeof screen !== "undefined" &&
    "orientation" in screen &&
    screen.orientation &&
    "lock" in screen.orientation
  ) {
    try {
      // @ts-expect-error - lock 은 일부 브라우저만 지원
      await screen.orientation.lock("portrait");
    } catch {
      // 데스크톱/Safari 등 미지원 — silently skip
    }
  }
}

export function unlockOrientation(): void {
  if (
    typeof screen !== "undefined" &&
    "orientation" in screen &&
    screen.orientation &&
    "unlock" in screen.orientation
  ) {
    try {
      // @ts-expect-error - unlock 은 일부 브라우저만
      screen.orientation.unlock();
    } catch {
      // ignore
    }
  }
}
