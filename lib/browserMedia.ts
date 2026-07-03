import { hasMeaningfulChange } from "./live/hasMeaningfulChange.ts";
import type { RegionHint } from "./schemas/classification.ts";

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("無法讀取圖片"));
    reader.readAsDataURL(blob);
  });
}

export async function normalizeUploadImage(blob: Blob, fileName?: string) {
  if (blob.type === "image/jpeg") {
    return { blob, mimeType: "image/jpeg" as const, fileName };
  }

  const image = await loadImageFromBlob(blob);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("無法處理圖片");
  context.drawImage(image, 0, 0);

  const jpegBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.92);
  });
  if (!jpegBlob) throw new Error("無法轉換圖片格式");

  return {
    blob: jpegBlob,
    mimeType: "image/jpeg" as const,
    fileName: replaceExtension(fileName ?? "", "jpg") || undefined,
  };
}

export async function captureChangedFrame(
  video: HTMLVideoElement,
  lastFrame: { current: Uint8ClampedArray | null },
) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
    return null;
  }

  const comparisonCanvas = document.createElement("canvas");
  comparisonCanvas.width = 32;
  comparisonCanvas.height = 32;
  const comparisonContext = comparisonCanvas.getContext("2d", { willReadFrequently: true });
  if (!comparisonContext) return null;
  comparisonContext.drawImage(video, 0, 0, 32, 32);
  const pixels = comparisonContext.getImageData(0, 0, 32, 32).data;
  if (!hasMeaningfulChange(lastFrame.current, pixels)) return null;
  lastFrame.current = new Uint8ClampedArray(pixels);

  return captureVideoFrame(video, 640, 0.65);
}

export async function captureVideoFrame(video: HTMLVideoElement, maxSize: number, quality: number) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
    return null;
  }

  const scale = Math.min(1, maxSize / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export function regionFromCoordinates(latitude: number, longitude: number): RegionHint | null {
  if (latitude >= 21.8 && latitude <= 25.4 && longitude >= 119.3 && longitude <= 122.1) return "tw";
  if (latitude >= 24 && latitude <= 46 && longitude >= 122.5 && longitude <= 146) return "jp";
  return null;
}

function loadImageFromBlob(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("無法讀取圖片"));
    };
    image.src = objectUrl;
  });
}

function replaceExtension(fileName: string, nextExtension: string) {
  if (!fileName) return "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) return `${fileName}.${nextExtension}`;
  return `${fileName.slice(0, dotIndex)}.${nextExtension}`;
}
