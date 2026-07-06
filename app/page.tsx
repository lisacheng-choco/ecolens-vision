"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  blobToBase64,
  captureChangedFrame,
  captureVideoFrame,
  normalizeUploadImage,
  regionFromCoordinates,
} from "@/lib/browserMedia";
import { clientLog } from "@/lib/clientLog";
import { classifierCopy } from "@/lib/classifierCopy";
import { consumeSseBuffer } from "@/lib/feedback/consumeSseBuffer";
import { municipalities } from "@/lib/schemas/classification";
import type {
  CaptureMode,
  ClassificationResult,
  Locale,
  MunicipalityId,
  RegionHint,
} from "@/lib/schemas/classification";
import type { FeedbackReason } from "@/lib/schemas/feedback";

type Status = "idle" | "cameraStarting" | "ready" | "classifying" | "classified" | "feedbackSubmitting" | "error";
type Mode = "upload" | "live";

const liveDelayMs = 10_000;
const maxLiveCalls = 12;

const feedbackReasons: Array<{ value: FeedbackReason; label: string; jaLabel: string }> = [
  { value: "wrong_category", label: "類別錯誤", jaLabel: "分類が違う" },
  { value: "wrong_region_rule", label: "地區規則錯誤", jaLabel: "地域ルールが違う" },
  { value: "missing_breakdown", label: "拆解不完整", jaLabel: "分別が不完全" },
  { value: "unclear_instruction", label: "提示不清楚", jaLabel: "説明が不明瞭" },
];

export default function Home() {
  const [region, setRegion] = useState<RegionHint>("jp");
  const [municipality, setMunicipality] = useState<MunicipalityId | "">("osaka");
  const [locale, setLocale] = useState<Locale>("zh-TW");
  const [mode, setMode] = useState<Mode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [error, setError] = useState("");
  const [feedbackReason, setFeedbackReason] = useState<FeedbackReason>("wrong_category");
  const [feedbackItemIndex, setFeedbackItemIndex] = useState(0);
  const [correctLabel, setCorrectLabel] = useState("");
  const [note, setNote] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackProgress, setFeedbackProgress] = useState("");
  const [feedbackStored, setFeedbackStored] = useState<boolean | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [geminiConsent, setGeminiConsent] = useState(false);
  const [liveActive, setLiveActive] = useState(false);
  const [liveCalls, setLiveCalls] = useState(0);
  const [locationMessage, setLocationMessage] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const feedbackDialogRef = useRef<HTMLDialogElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRunRef = useRef(0);
  const liveCallsRef = useRef(0);
  const lastFrameRef = useRef<Uint8ClampedArray | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const feedbackStreamRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);
  const stableSignatureRef = useRef("");
  const pendingSignatureRef = useRef("");
  const pendingSignatureCountRef = useRef(0);
  const regionRef = useRef(region);
  const municipalityRef = useRef(municipality);
  const localeRef = useRef(locale);

  regionRef.current = region;
  municipalityRef.current = municipality;
  localeRef.current = locale;

  const copy = classifierCopy(locale);
  const countryLabel = region === "tw" ? (locale === "ja-JP" ? "台湾" : "台灣") : "日本";
  const canClassify = Boolean(
    status !== "classifying" && status !== "feedbackSubmitting" && file && geminiConsent,
  );

  const statusText = useMemo(() => {
    if (locale === "ja-JP") {
      if (status === "cameraStarting") return "カメラを起動中";
      if (status === "classifying") return "確認中";
      if (status === "feedbackSubmitting") return "送信中";
      if (status === "classified") return "完了";
      if (status === "ready") return "確認できます";
      if (status === "error") return "要確認";
      return mode === "live" ? "カメラ待ち" : "写真待ち";
    }
    if (status === "cameraStarting") return "開啟相機中";
    if (status === "classifying") return "辨識中";
    if (status === "feedbackSubmitting") return "送出回饋中";
    if (status === "classified") return "已完成";
    if (status === "ready") return "可以辨識";
    if (status === "error") return "需要處理";
    return mode === "live" ? "等待相機" : "等待圖片";
  }, [locale, mode, status]);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) stopLive();
    };

    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenHidden);
      liveRunRef.current += 1;
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      requestRef.current?.abort();
      feedbackStreamRef.current?.abort();
    };
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    setFeedbackItemIndex(0);
  }, [result?.requestId]);

  useEffect(() => {
    if (result && mode === "upload") resultRef.current?.focus();
  }, [mode, result?.requestId]);

  useEffect(() => {
    const dialog = feedbackDialogRef.current;
    if (!dialog) return;
    if (feedbackOpen && !dialog.open) dialog.showModal();
    if (!feedbackOpen && dialog.open) dialog.close();
  }, [feedbackOpen]);

  function onFileChange(nextFile: File | null) {
    setError("");
    setFeedbackMessage("");
    setResult(null);
    setFile(nextFile);
    setStatus(nextFile ? "ready" : "idle");
    setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : "");
  }

  function changeRegion(nextRegion: RegionHint) {
    if (nextRegion === regionRef.current) return;
    requestVersionRef.current += 1;
    requestRef.current?.abort();
    setRegion(nextRegion);
    setMunicipality("");
    setResult(null);
    setStatus(mode === "upload" && file ? "ready" : liveActive ? "ready" : "idle");
  }

  function changeMunicipality(nextMunicipality: MunicipalityId | "") {
    if (nextMunicipality === municipalityRef.current) return;
    requestVersionRef.current += 1;
    requestRef.current?.abort();
    setMunicipality(nextMunicipality);
    setResult(null);
    setStatus(mode === "upload" && file ? "ready" : liveActive ? "ready" : "idle");
  }

  function changeLocale(nextLocale: Locale) {
    if (nextLocale === localeRef.current) return;
    requestVersionRef.current += 1;
    requestRef.current?.abort();
    setLocale(nextLocale);
    setStatus(result ? "classified" : mode === "upload" && file ? "ready" : liveActive ? "ready" : "idle");
  }

  function changeMode(nextMode: Mode) {
    if (nextMode === "upload") stopLive();
    setMode(nextMode);
    setError("");
    setStatus(nextMode === "upload" && file ? "ready" : "idle");
  }

  function detectRegion() {
    if (!navigator.geolocation) {
      setLocationMessage("此瀏覽器不支援定位");
      return;
    }

    setLocationMessage("定位中");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const detected = regionFromCoordinates(coords.latitude, coords.longitude);
        if (!detected) {
          setLocationMessage("目前位置不在台灣或日本範圍");
          return;
        }

        const label = detected === "tw" ? "台灣" : "日本";
        setLocationMessage(`偵測到${label}`);
        if (detected !== regionRef.current && window.confirm(`偵測到${label}，要切換法規地區嗎？`)) {
          changeRegion(detected);
        }
      },
      () => setLocationMessage("無法取得位置，仍可手動選擇"),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    );
  }

  async function classify() {
    if (!file) return;
    await requestClassification(file, file.name, "upload");
  }

  async function requestClassification(
    blob: Blob,
    fileName: string,
    captureMode: CaptureMode,
    forceResult = captureMode === "upload",
  ) {
    const controller = new AbortController();
    const requestVersion = ++requestVersionRef.current;
    requestRef.current?.abort();
    requestRef.current = controller;
    setStatus("classifying");
    setError("");
    let normalized: { blob: Blob; mimeType: "image/jpeg"; fileName?: string } = {
      blob,
      mimeType: blob.type === "image/jpeg" ? "image/jpeg" : "image/jpeg",
      fileName,
    };

    try {
      normalized = captureMode === "upload" ? await normalizeUploadImage(blob, fileName) : normalized;
      const base64 = await blobToBase64(normalized.blob);
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          image: {
            mimeType: normalized.mimeType,
            base64,
            fileName: normalized.fileName ?? fileName,
          },
          capture: { mode: captureMode },
          regionHint: regionRef.current,
          municipality: municipalityRef.current || undefined,
          locale: localeRef.current,
        }),
      });
      const requestId = response.headers.get("x-request-id");
      const payload = await response.json();
      if (!response.ok) {
        clientLog("error", "classification.client_failed", {
          requestId,
          status: response.status,
          captureMode,
          fileName: normalized.fileName ?? fileName,
          mimeType: normalized.mimeType,
          message: payload.error ?? "分類失敗",
        });
        throw new Error(payload.error ?? "分類失敗");
      }
      if (requestVersion !== requestVersionRef.current) return;
      if (forceResult) {
        setResult(payload);
        stableSignatureRef.current = resultSignature(payload);
        pendingSignatureRef.current = "";
        pendingSignatureCountRef.current = 0;
      } else {
        acceptStableResult(payload);
      }
      clientLog("info", "classification.client_completed", {
        requestId,
        status: response.status,
        captureMode,
        fileName: normalized.fileName ?? fileName,
        mimeType: normalized.mimeType,
        itemCount: payload.items?.length ?? 0,
      });
      setStatus("classified");
    } catch (classificationError) {
      if (controller.signal.aborted) return;
      clientLog("error", "classification.client_error", {
        captureMode,
        fileName: normalized.fileName ?? fileName,
        mimeType: normalized.mimeType,
        message: classificationError instanceof Error ? classificationError.message : "分類失敗",
      });
      setError(classificationError instanceof Error ? classificationError.message : "分類失敗");
      setStatus("error");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  async function startLive() {
    if (!geminiConsent) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("此瀏覽器不支援相機");
      return;
    }

    stopLive();
    setMode("live");
    setStatus("cameraStarting");
    setError("");
    setLiveCalls(0);
    liveCallsRef.current = 0;
    lastFrameRef.current = null;
    stableSignatureRef.current = "";
    pendingSignatureRef.current = "";
    pendingSignatureCountRef.current = 0;
    const runId = ++liveRunRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (runId !== liveRunRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      if (!videoRef.current) throw new Error("找不到相機預覽");
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setLiveActive(true);
      setStatus("ready");
      void runLiveDetection(runId);
    } catch (cameraError) {
      if (runId !== liveRunRef.current) return;
      stopLive();
      setError(cameraError instanceof Error ? cameraError.message : "無法開啟相機");
      setStatus("error");
    }
  }

  function stopLive() {
    liveRunRef.current += 1;
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    liveTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    requestVersionRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    lastFrameRef.current = null;
    setLiveActive(false);
    setStatus((current) => current === "classified" ? "classified" : "idle");
  }

  async function runLiveDetection(runId: number) {
    if (runId !== liveRunRef.current || !videoRef.current) return;
    if (requestRef.current) {
      liveTimerRef.current = setTimeout(() => void runLiveDetection(runId), liveDelayMs);
      return;
    }

    const frame = await captureChangedFrame(videoRef.current, lastFrameRef);
    if (frame && runId === liveRunRef.current) {
      liveCallsRef.current += 1;
      setLiveCalls(liveCallsRef.current);
      await requestClassification(frame, `live-${Date.now()}.jpg`, "live");
    }

    if (runId !== liveRunRef.current) return;
    if (liveCallsRef.current >= maxLiveCalls) {
      stopLive();
      return;
    }

    liveTimerRef.current = setTimeout(() => void runLiveDetection(runId), liveDelayMs);
  }

  async function confirmLiveCapture() {
    if (!liveActive || !videoRef.current || requestRef.current) return;
    const frame = await captureVideoFrame(videoRef.current, 1280, 0.85);
    if (!frame) return;

    liveCallsRef.current += 1;
    setLiveCalls(liveCallsRef.current);
    await requestClassification(frame, `capture-${Date.now()}.jpg`, "live", true);
    if (liveCallsRef.current >= maxLiveCalls) stopLive();
  }

  function acceptStableResult(nextResult: ClassificationResult) {
    const signature = resultSignature(nextResult);
    if (!stableSignatureRef.current || signature === stableSignatureRef.current) {
      stableSignatureRef.current = signature;
      pendingSignatureRef.current = "";
      pendingSignatureCountRef.current = 0;
      setResult(nextResult);
      return;
    }

    if (pendingSignatureRef.current === signature) {
      pendingSignatureCountRef.current += 1;
    } else {
      pendingSignatureRef.current = signature;
      pendingSignatureCountRef.current = 1;
    }

    if (pendingSignatureCountRef.current >= 2) {
      stableSignatureRef.current = signature;
      pendingSignatureRef.current = "";
      pendingSignatureCountRef.current = 0;
      setResult(nextResult);
    }
  }

  async function submitFeedback() {
    if (!result) return;
    const selectedItem = result.items[feedbackItemIndex] ?? result.items[0];
    if (!selectedItem) return;
    setStatus("feedbackSubmitting");
    setFeedbackMessage("");
    setFeedbackProgress("");
    setFeedbackStored(null);
    setError("");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classificationRequestId: result.requestId,
          reason: feedbackReason,
          userCorrectLabel: correctLabel,
          userNote: note,
          region: result.region.country,
          ruleKey: selectedItem.ruleKey,
          detectedItemName: selectedItem.item.name,
          municipality: result.region.municipality,
          strategy: selectedItem.strategy,
          evidenceChunkIds: selectedItem.evidence.map((item) => item.chunkId),
        }),
      });
      const requestId = response.headers.get("x-request-id");
      const payload = await response.json();
      if (!response.ok) {
        clientLog("error", "feedback.client_failed", {
          requestId,
          classificationRequestId: result.requestId,
          status: response.status,
          reason: feedbackReason,
          message: payload.error ?? "回饋送出失敗",
        });
        throw new Error(payload.error ?? "回饋送出失敗");
      }
      clientLog("info", "feedback.client_completed", {
        requestId,
        classificationRequestId: result.requestId,
        stored: payload.stored,
        duplicate: payload.duplicate,
      });
      setFeedbackMessage(payload.message);
      setFeedbackStored(payload.stored);
      setStatus("classified");
      setCorrectLabel("");
      setNote("");
      try {
        await streamFeedback(result.requestId);
      } catch {}
    } catch (feedbackError) {
      const message = feedbackError instanceof Error ? feedbackError.message : "回饋送出失敗";
      clientLog("error", "feedback.client_error", {
        classificationRequestId: result.requestId,
        reason: feedbackReason,
        message,
      });
      setFeedbackMessage(message);
      setFeedbackStored(false);
      setStatus("error");
    }
  }

  async function streamFeedback(requestId: string) {
    feedbackStreamRef.current?.abort();
    const controller = new AbortController();
    feedbackStreamRef.current = controller;
    const response = await fetch(`/api/feedback/stream?requestId=${encodeURIComponent(requestId)}`, {
      signal: controller.signal,
    });
    const streamRequestId = response.headers.get("x-request-id");
    if (!response.ok || !response.body) {
      clientLog("error", "feedback.stream_client_failed", {
        streamRequestId,
        classificationRequestId: requestId,
        status: response.status,
      });
      throw new Error("無法讀取回饋狀態");
    }
    clientLog("info", "feedback.stream_client_started", {
      streamRequestId,
      classificationRequestId: requestId,
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const parsed = consumeSseBuffer(buffer);
      buffer = parsed.rest;
      for (const message of parsed.messages) {
        await typeFeedbackMessage(message, controller.signal);
      }
      if (done) break;
    }

    if (feedbackStreamRef.current === controller) feedbackStreamRef.current = null;
  }

  async function typeFeedbackMessage(message: string, signal: AbortSignal) {
    for (let length = 1; length <= message.length; length += 1) {
      if (signal.aborted) return;
      setFeedbackProgress(message.slice(0, length));
      await new Promise((resolve) => setTimeout(resolve, 24));
    }
  }

  return (
    <main className="shell">
      <section className="workspace" aria-label="EcoLens">
        <header className="topbar">
          <div>
            <p className="eyebrow">EcoLens · {copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p className="intro">{copy.subtitle}</p>
          </div>
          <div aria-live="polite" className={`statusPill status-${status}`}>
            <span aria-hidden="true" />
            {statusText}
          </div>
        </header>

        <aside className="pocBanner" aria-label="大阪市 POC 適用範圍">
          <div>
            <strong>大阪市 POC</strong>
            <span>繁體中文 · 家庭日常垃圾</span>
          </div>
          <p>目前僅涵蓋常見家戶垃圾；資料來源為大阪市，本測試服務並非大阪市官方提供。</p>
        </aside>

        <div className="controlRow settingsBar pocHidden">
          <div>
            <p className="controlLabel">{copy.region}</p>
            <div className="controls" aria-label={copy.region}>
              <button className={region === "tw" ? "selected" : ""} type="button" onClick={() => changeRegion("tw")}>
                {locale === "ja-JP" ? "台湾" : "台灣"}
              </button>
              <button className={region === "jp" ? "selected" : ""} type="button" onClick={() => changeRegion("jp")}>
                日本
              </button>
              <button type="button" onClick={detectRegion}>{copy.locate}</button>
            </div>
            {locationMessage ? <p className="controlHint">{locationMessage}</p> : null}
          </div>
          <div>
            <p className="controlLabel">{copy.language}</p>
            <div className="controls" aria-label={copy.language}>
              <button className={locale === "zh-TW" ? "selected" : ""} type="button" onClick={() => changeLocale("zh-TW")}>
                繁中
              </button>
              <button className={locale === "ja-JP" ? "selected" : ""} type="button" onClick={() => changeLocale("ja-JP")}>
                日本語
              </button>
            </div>
          </div>
          <label>
            <span className="controlLabel">{copy.municipality}</span>
            <select
              aria-label={copy.municipality}
              value={municipality}
              onChange={(event) => changeMunicipality(event.target.value as MunicipalityId | "")}
            >
              <option value="">{copy.unspecifiedMunicipality}</option>
              {municipalities[region].map(([id, zhLabel, jaLabel]) => (
                <option key={id} value={id}>{locale === "ja-JP" ? jaLabel : zhLabel}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="controls modeControls pocHidden" aria-label={locale === "ja-JP" ? "確認方法" : "辨識方式"}>
          <button aria-pressed={mode === "upload"} className={mode === "upload" ? "selected" : ""} type="button" onClick={() => changeMode("upload")}>
            {copy.upload}
          </button>
          <button aria-pressed={mode === "live"} className={mode === "live" ? "selected" : ""} type="button" onClick={() => changeMode("live")}>
            {copy.live}
          </button>
        </div>

        <div className="grid">
          <section className="panel uploadPanel">
            {mode === "upload" ? (
              <label className="dropzone">
                <input
                  accept="image/jpeg,image/png,image/webp"
                  type="file"
                  onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
                />
                {previewUrl ? (
                  <img alt={locale === "ja-JP" ? "選択した写真" : "已選圖片預覽"} src={previewUrl} />
                ) : (
                  <div className="dropzonePrompt">
                    <span aria-hidden="true" className="cameraMark">＋</span>
                    <strong>{copy.chooseTitle}</strong>
                    <small>{copy.chooseHint}</small>
                  </div>
                )}
              </label>
            ) : (
              <div className="dropzone livePreview">
                <video className={liveActive ? "" : "hidden"} muted playsInline ref={videoRef} />
                {!liveActive ? (
                  <div className="dropzonePrompt">
                    <span aria-hidden="true" className="cameraMark">◎</span>
                    <strong>{copy.cameraOff}</strong>
                    <small>{copy.chooseHint}</small>
                  </div>
                ) : null}
              </div>
            )}
            <label className="consent">
              <input
                checked={geminiConsent}
                type="checkbox"
                onChange={(event) => {
                  setGeminiConsent(event.target.checked);
                  if (!event.target.checked && liveActive) stopLive();
                }}
              />
              <span>{copy.consent}</span>
            </label>
            {!geminiConsent ? <p className="consentHint">{copy.consentHint}</p> : null}
            {mode === "upload" ? (
              <div className="actions">
                <span>{file ? file.name : `${countryLabel}${locale === "ja-JP" ? "のルール" : "規則"}`}</span>
                <button disabled={!canClassify} type="button" onClick={classify}>
                  {status === "classifying" ? copy.classifying : copy.classify}
                </button>
              </div>
            ) : (
              <div className="actions">
                <span>
                  {liveActive
                    ? `${locale === "ja-JP" ? "自動確認" : "自動辨識"} ${liveCalls}/${maxLiveCalls}`
                    : `${countryLabel}${locale === "ja-JP" ? "のルール" : "規則"}`}
                </span>
                <div className="liveCommands">
                  {liveActive ? (
                    <button disabled={status === "classifying"} type="button" onClick={confirmLiveCapture}>
                      {copy.capture}
                    </button>
                  ) : null}
                  <button
                    disabled={!liveActive && (!geminiConsent || status === "cameraStarting")}
                    type="button"
                    onClick={liveActive ? stopLive : startLive}
                  >
                    {liveActive ? copy.stop : copy.start}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section
            aria-live="polite"
            className={`panel resultPanel ${result ? "hasResult" : ""}`}
            ref={resultRef}
            tabIndex={-1}
          >
            {result ? (
              <>
                <div className="resultContext">
                  <strong>
                    {result.locale === "ja-JP"
                      ? result.region.country === "JP" ? "日本のルール" : "台湾のルール"
                      : result.region.country === "JP" ? "日本法規" : "台灣法規"}
                  </strong>
                  {result.region.municipality ? <span>{result.region.municipality}</span> : null}
                  <span>{result.locale === "ja-JP" ? "日本語" : result.locale === "en" ? "English" : "繁體中文"}</span>
                </div>
                {result.items.length > 1 ? (
                  <nav className="itemIndex" aria-label={locale === "ja-JP" ? "認識した品目" : "辨識項目索引"}>
                    <span>{copy.detected} {result.items.length} {copy.itemUnit}</span>
                    {result.items.map((item, index) => (
                      <a href={`#result-item-${index}`} key={`${item.ruleKey}-${index}`}>{item.item.name}</a>
                    ))}
                  </nav>
                ) : null}
                {result.items.map((classifiedItem, itemIndex) => (
                  <section
                    className={`classifiedItem ${classifiedItem.strategy === "unresolved" ? "unknownResult" : ""}`}
                    id={`result-item-${itemIndex}`}
                    key={`${classifiedItem.ruleKey}-${itemIndex}`}
                  >
                    <div className="resultHead">
                      <div>
                        <h2>{classifiedItem.item.name}</h2>
                        <p className="resultLabel">
                          {classifiedItem.components.length > 0
                            ? `${copy.parts} ${classifiedItem.components.length} ${copy.partUnit}`
                            : classifiedItem.overall.label}
                        </p>
                      </div>
                      <div className="itemActions">
                        {classifiedItem.item.confidence < 0.7 ? (
                          <span className="lowConfidence">{copy.lowConfidence}</span>
                        ) : null}
                        <button
                          className="itemFeedback"
                          type="button"
                          onClick={() => {
                            setFeedbackItemIndex(itemIndex);
                            setFeedbackOpen(true);
                          }}
                        >
                          {copy.report}
                        </button>
                      </div>
                    </div>
                    <p className="summary">{classifiedItem.overall.summary}</p>
                    {classifiedItem.rule ? (
                      <p className="ruleScope">
                        <strong>{classifiedItem.rule.scopeLabel}</strong>
                        <span>
                          {classifiedItem.rule.scope === "municipality"
                            ? locale === "ja-JP" ? "自治体ルール" : "自治體規則"
                            : locale === "ja-JP" ? "国の原則" : "國家原則"}
                        </span>
                        {classifiedItem.rule.reviewedAt ? (
                          <span>
                            {locale === "ja-JP" ? "確認日" : "審核日期"}：{classifiedItem.rule.reviewedAt}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    <div className="components">
                      {classifiedItem.components.map((component) => (
                        <article
                          className="component"
                          data-destination={component.destination.type}
                          key={component.id}
                        >
                          <div className="componentHead">
                            <h3>{component.name}</h3>
                          </div>
                          <div className="destination">
                            <span>{copy.dispose}</span>
                            <strong>{component.category}</strong>
                            {component.category !== component.destination.label
                              ? <small>{component.destination.label}</small>
                              : null}
                          </div>
                          <p className="componentAction"><strong>{copy.prepare}</strong>{component.action}</p>
                          {component.destination.fallback ? (
                            <p className="fallback">
                              <strong>{copy.exception}</strong>
                              {component.destination.fallback.condition} → {component.destination.fallback.label}
                            </p>
                          ) : null}
                          {component.warning ? <p className="warning">{component.warning}</p> : null}
                        </article>
                      ))}
                    </div>
                    {classifiedItem.evidence.length > 0 ? (
                      <div className="evidence">
                        <strong>{locale === "ja-JP" ? "公式情報" : "官方依據"}</strong>
                        {classifiedItem.evidence.map((source) => (
                          <a href={source.url} key={source.chunkId} rel="noreferrer" target="_blank">
                            {source.title}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ))}
                <details className="diagnostics">
                  <summary>{copy.details}</summary>
                  <p>
                    {result.model.provider} · {result.model.version} · {result.model.calls} call(s) · {result.requestId}
                  </p>
                </details>
                {mode === "upload" ? (
                  <button className="againButton" type="button" onClick={() => onFileChange(null)}>
                    {copy.again}
                  </button>
                ) : null}
              </>
            ) : (
              <div className="empty">
                <span aria-hidden="true">→</span>
                <h2>{copy.emptyTitle}</h2>
                <p>{mode === "live" ? copy.emptyLive : copy.emptyUpload}</p>
              </div>
            )}
          </section>
        </div>

        {result ? (
          <dialog
            className="feedbackDialog"
            onClose={() => setFeedbackOpen(false)}
            ref={feedbackDialogRef}
          >
            <aside
              aria-label={copy.feedbackTitle}
              className="feedbackDrawer"
            >
              <header className="drawerHead">
                <div>
                  <p className="eyebrow">Feedback</p>
                  <h2>{copy.feedbackTitle}</h2>
                </div>
                <button aria-label={copy.close} title={copy.close} type="button" onClick={() => setFeedbackOpen(false)}>
                  ×
                </button>
              </header>
              <div className="feedbackPanel">
                <select
                  aria-label={copy.feedbackItem}
                  autoFocus
                  value={feedbackItemIndex}
                  onChange={(event) => setFeedbackItemIndex(Number(event.target.value))}
                >
                  {result.items.map((item, index) => (
                    <option key={`${item.ruleKey}-${index}`} value={index}>
                      {item.item.name}
                    </option>
                  ))}
                </select>
                <select value={feedbackReason} onChange={(event) => setFeedbackReason(event.target.value as FeedbackReason)}>
                  {feedbackReasons.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {locale === "ja-JP" ? reason.jaLabel : reason.label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={copy.correctLabel}
                  placeholder={copy.correctLabel}
                  value={correctLabel}
                  onChange={(event) => setCorrectLabel(event.target.value)}
                />
                <textarea aria-label={copy.note} placeholder={copy.note} value={note} onChange={(event) => setNote(event.target.value)} />
                <button disabled={status === "feedbackSubmitting"} type="button" onClick={submitFeedback}>
                  {copy.submit}
                </button>
                {feedbackMessage ? (
                  <p className={feedbackStored ? "success" : "warning"}>{feedbackMessage}</p>
                ) : null}
                {feedbackProgress ? <p aria-live="polite" className="success">{feedbackProgress}</p> : null}
              </div>
            </aside>
          </dialog>
        ) : null}

        {error ? <p className="errorMessage">{error}</p> : null}
      </section>
    </main>
  );
}

function resultSignature(result: ClassificationResult) {
  return result.items
    .map((item) => `${item.strategy}:${item.ruleKey}:${item.item.name.trim().toLocaleLowerCase()}`)
    .sort()
    .join(",");
}
