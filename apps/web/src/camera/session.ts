export const CAMERA_PERMISSION_TIMEOUT_MS = 15_000;
export const CAMERA_ATTACHMENT_TIMEOUT_MS = 10_000;
export const CAMERA_WARMUP_MS = 1_200;
const MAX_DIAGNOSTIC_EVENTS = 20;

export type CameraState =
  | "privacy-introduction"
  | "permission-pending"
  | "camera-starting"
  | "camera-switching"
  | "warm-up"
  | "ready"
  | "stopped"
  | "recoverable-error";
export type CameraRecoveryReason =
  | "insecure-context"
  | "denied-permission"
  | "missing-camera"
  | "busy-unreadable-camera"
  | "overconstrained-request"
  | "aborted-request"
  | "inactive-document"
  | "ignored-prompt"
  | "interruption"
  | "unsupported-camera-api"
  | "switch-failed"
  | "playback-unavailable";
export type CameraPermission = "unknown" | "prompt" | "granted" | "denied";
export type CameraSnapshot = {
  canSwitch: boolean;
  diagnostics: readonly string[];
  facingMode?: string;
  generation: number;
  height?: number;
  permission: CameraPermission;
  reason?: CameraRecoveryReason;
  state: CameraState;
  width?: number;
};
export type CameraSessionDependencies = {
  attachAndPlay: (
    stream: MediaStream,
    signal: AbortSignal,
  ) => Promise<{ height: number; width: number }>;
  detach?: () => void;
  enumerateDevices: () => Promise<MediaDeviceInfo[]>;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  isMobile: () => boolean;
  isSecureContext: () => boolean;
  restore?: (stream: MediaStream, signal: AbortSignal) => Promise<void>;
};
type AttemptOutcome = "success" | "failed" | "superseded";

export function createInitialCameraSnapshot(): CameraSnapshot {
  return {
    canSwitch: false,
    diagnostics: ["state:privacy-introduction"],
    generation: 0,
    permission: "unknown",
    state: "privacy-introduction",
  };
}

export function mapCameraError(error: unknown): CameraRecoveryReason {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String(error.name)
      : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "denied-permission";
    case "NotFoundError":
      return "missing-camera";
    case "NotReadableError":
      return "busy-unreadable-camera";
    case "OverconstrainedError":
      return "overconstrained-request";
    case "AbortError":
      return "aborted-request";
    case "InvalidStateError":
      return "inactive-document";
    case "IgnoredPromptError":
      return "ignored-prompt";
    default:
      return "unsupported-camera-api";
  }
}

function stopTracks(stream: MediaStream | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}
function initialConstraints(isMobile: boolean): MediaStreamConstraints {
  const video: MediaTrackConstraints = {
    frameRate: { ideal: 30 },
    height: { ideal: 720 },
    width: { ideal: 1280 },
  };
  if (isMobile) video.facingMode = { ideal: "user" };
  return { audio: false, video };
}
function switchedConstraints(
  deviceId: string | undefined,
  facingMode: string | undefined,
): MediaStreamConstraints {
  const video: MediaTrackConstraints = {
    frameRate: { ideal: 30 },
    height: { ideal: 720 },
    width: { ideal: 1280 },
  };
  if (deviceId) video.deviceId = { exact: deviceId };
  else if (facingMode) video.facingMode = { exact: facingMode };
  return { audio: false, video };
}

export class CameraSession {
  private activeBeforeHide = false;
  private activeStream: MediaStream | undefined;
  private activeTrack: MediaStreamTrack | undefined;
  private attemptAbort: AbortController | undefined;
  private candidateStream: MediaStream | undefined;
  private deviceIds: string[] = [];
  private deviceIndex = 0;
  private lastDeviceId: string | undefined;
  private lastFacingMode: string | undefined;
  private listeners = new Set<(snapshot: CameraSnapshot) => void>();
  private requestEpoch = 0;
  private snapshotValue = createInitialCameraSnapshot();
  private warmupTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: CameraSessionDependencies) {}
  get snapshot() {
    return this.snapshotValue;
  }
  subscribe(listener: (snapshot: CameraSnapshot) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(preserveChoice = false) {
    if (!this.deps.isSecureContext()) {
      this.setSnapshot({
        permission: "unknown",
        reason: "insecure-context",
        state: "recoverable-error",
      });
      return;
    }
    const constraints =
      preserveChoice && this.lastDeviceId
        ? switchedConstraints(this.lastDeviceId, undefined)
        : preserveChoice && this.lastFacingMode
          ? switchedConstraints(undefined, this.lastFacingMode)
          : initialConstraints(this.deps.isMobile());
    await this.acquire(constraints, false);
  }
  async restart() {
    this.invalidateInFlightAndOwned();
    await this.start();
  }

  async switchCamera() {
    if (!this.activeStream || !this.snapshotValue.canSwitch) return;
    const oldSnapshot = this.snapshotValue;
    const oldStream = this.activeStream;
    const oldTrack = this.activeTrack;
    const currentDeviceId = oldTrack?.getSettings().deviceId;
    const currentIndex = this.deviceIds.indexOf(currentDeviceId ?? "");
    const nextIndex =
      this.deviceIds.length > 1
        ? (currentIndex >= 0 ? currentIndex + 1 : this.deviceIndex + 1) %
          this.deviceIds.length
        : -1;
    const nextDeviceId = nextIndex >= 0 ? this.deviceIds[nextIndex] : undefined;
    const alternateFacing =
      oldTrack?.getSettings().facingMode === "user" ? "environment" : "user";
    const { epoch, outcome } = await this.acquire(
      switchedConstraints(nextDeviceId, alternateFacing),
      true,
      {
        deviceId: nextDeviceId,
        facingMode: nextDeviceId ? undefined : alternateFacing,
      },
    );
    if (
      outcome !== "failed" ||
      epoch !== this.requestEpoch ||
      this.activeStream !== oldStream
    )
      return;

    const restoreAbort = new AbortController();
    this.attemptAbort = restoreAbort;
    try {
      await this.deps.restore?.(oldStream, restoreAbort.signal);
      if (epoch !== this.requestEpoch || restoreAbort.signal.aborted) return;
      this.activeTrack = oldTrack;
      this.setSnapshot({ ...oldSnapshot, reason: "switch-failed" });
      if (oldSnapshot.state === "warm-up") this.scheduleWarmup(epoch);
    } catch (error) {
      if (epoch !== this.requestEpoch || restoreAbort.signal.aborted) return;
      stopTracks(oldStream);
      this.activeStream = undefined;
      this.activeTrack = undefined;
      this.setSnapshot({
        reason: mapCameraError(error),
        state: "recoverable-error",
      });
    } finally {
      if (this.attemptAbort === restoreAbort) this.attemptAbort = undefined;
    }
    if (nextIndex >= 0 && this.activeStream !== oldStream)
      this.deviceIndex = nextIndex;
  }

  stop() {
    this.invalidateInFlightAndOwned();
    this.setSnapshot({
      permission: this.snapshotValue.permission,
      reason: undefined,
      state: "stopped",
    });
  }
  setVisibility(visible: boolean): Promise<void> | void {
    if (!visible) {
      this.activeBeforeHide = Boolean(
        this.activeStream || this.candidateStream || this.attemptAbort,
      );
      if (this.activeBeforeHide) {
        this.invalidateInFlightAndOwned();
        this.setSnapshot({
          permission: this.snapshotValue.permission,
          reason: "inactive-document",
          state: "stopped",
        });
      }
      return;
    }
    if (!this.activeBeforeHide) return;
    this.activeBeforeHide = false;
    return this.start(true);
  }
  async reconstructForOrientation() {
    if (!this.activeStream) return;
    this.invalidateInFlightAndOwned();
    await this.start(true);
  }
  dispose() {
    this.activeBeforeHide = false;
    this.invalidateInFlightAndOwned();
    this.listeners.clear();
  }

  private async acquire(
    constraints: MediaStreamConstraints,
    isSwitch: boolean,
    expected?: { deviceId?: string; facingMode?: string },
  ): Promise<{ epoch: number; outcome: AttemptOutcome }> {
    const epoch = ++this.requestEpoch;
    const abort = new AbortController();
    this.attemptAbort?.abort();
    this.attemptAbort = abort;
    this.clearWarmup();
    this.setSnapshot({
      permission: "prompt",
      reason: undefined,
      state: isSwitch ? "camera-switching" : "permission-pending",
    });
    let stream: MediaStream;
    try {
      stream = await this.requestWithTimeout(constraints, epoch, abort.signal);
    } catch (error) {
      if (this.attemptAbort === abort) this.attemptAbort = undefined;
      if (epoch !== this.requestEpoch || abort.signal.aborted)
        return { epoch, outcome: "superseded" };
      if (!isSwitch) this.setError(error);
      return { epoch, outcome: "failed" };
    }
    if (epoch !== this.requestEpoch || abort.signal.aborted) {
      stopTracks(stream);
      return { epoch, outcome: "superseded" };
    }
    this.candidateStream = stream;
    this.setSnapshot({
      permission: "granted",
      reason: undefined,
      state: "camera-starting",
    });
    try {
      const decoded = await this.deps.attachAndPlay(stream, abort.signal);
      if (
        epoch !== this.requestEpoch ||
        abort.signal.aborted ||
        this.candidateStream !== stream
      ) {
        stopTracks(stream);
        return { epoch, outcome: "superseded" };
      }
      const track = stream.getVideoTracks()[0];
      if (!track) throw { name: "NotFoundError" };
      const settings = track.getSettings();
      if (
        expected &&
        ((expected.deviceId && settings.deviceId !== expected.deviceId) ||
          (expected.facingMode && settings.facingMode !== expected.facingMode))
      ) {
        throw { name: "SameCameraError" };
      }
      const capabilities = track.getCapabilities?.();
      const priorStream = this.activeStream;
      this.candidateStream = undefined;
      this.activeStream = stream;
      this.activeTrack = track;
      this.lastDeviceId = settings.deviceId;
      this.lastFacingMode = settings.facingMode;
      track.addEventListener("ended", () => this.handleTrackEnded(stream));
      if (priorStream && priorStream !== stream) stopTracks(priorStream);
      this.snapshotValue = {
        ...this.snapshotValue,
        canSwitch:
          this.deviceIds.length > 1 ||
          (Array.isArray(capabilities?.facingMode) &&
            capabilities.facingMode.length > 1),
        facingMode: settings.facingMode,
        generation: this.snapshotValue.generation + 1,
        height: decoded.height || settings.height,
        permission: "granted",
        reason: undefined,
        state: "warm-up",
        width: decoded.width || settings.width,
      };
      this.record("state:warm-up");
      this.emit();
      void this.refreshDevices(epoch);
      this.scheduleWarmup(epoch);
      return { epoch, outcome: "success" };
    } catch (error) {
      if (this.candidateStream === stream) this.candidateStream = undefined;
      stopTracks(stream);
      this.deps.detach?.();
      if (epoch !== this.requestEpoch || abort.signal.aborted)
        return { epoch, outcome: "superseded" };
      if (!isSwitch) this.setError(error);
      return { epoch, outcome: "failed" };
    } finally {
      if (this.attemptAbort === abort) this.attemptAbort = undefined;
    }
  }

  private requestWithTimeout(
    constraints: MediaStreamConstraints,
    epoch: number,
    signal: AbortSignal,
  ): Promise<MediaStream> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        if (!settled) {
          settled = true;
          finish();
          reject({ name: "AbortError" });
        }
      };
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          finish();
          reject({ name: "IgnoredPromptError" });
        }
      }, CAMERA_PERMISSION_TIMEOUT_MS);
      signal.addEventListener("abort", onAbort, { once: true });
      let request: Promise<MediaStream>;
      try {
        request = this.deps.getUserMedia(constraints);
      } catch (error) {
        if (!settled) {
          settled = true;
          finish();
          reject(error);
        }
        return;
      }
      request.then(
        (stream) => {
          if (settled || epoch !== this.requestEpoch || signal.aborted) {
            stopTracks(stream);
            return;
          }
          settled = true;
          finish();
          resolve(stream);
        },
        (error: unknown) => {
          if (settled || epoch !== this.requestEpoch || signal.aborted) return;
          settled = true;
          finish();
          reject(error);
        },
      );
    });
  }
  private async refreshDevices(epoch: number) {
    try {
      const devices = await this.deps.enumerateDevices();
      if (epoch !== this.requestEpoch) return;
      this.deviceIds = devices
        .filter(
          (device) => device.kind === "videoinput" && Boolean(device.deviceId),
        )
        .map((device) => device.deviceId);
      const current = this.activeTrack?.getSettings().deviceId;
      const index = this.deviceIds.indexOf(current ?? "");
      if (index >= 0) this.deviceIndex = index;
      this.setSnapshot({
        canSwitch: this.deviceIds.length > 1 || this.snapshotValue.canSwitch,
      });
    } catch {
      /* enumeration is optional after a working stream */
    }
  }
  private handleTrackEnded(stream: MediaStream) {
    if (stream !== this.activeStream) return;
    this.invalidateInFlightAndOwned();
    // A stopped track cannot produce a valid result, so invalidate the public
    // generation before publishing the interruption state.
    this.setSnapshot({
      generation: this.snapshotValue.generation + 1,
      reason: "interruption",
      state: "recoverable-error",
    });
  }
  private invalidateInFlightAndOwned() {
    this.requestEpoch += 1;
    this.attemptAbort?.abort();
    this.attemptAbort = undefined;
    this.clearWarmup();
    stopTracks(this.candidateStream);
    this.candidateStream = undefined;
    stopTracks(this.activeStream);
    this.activeStream = undefined;
    this.activeTrack = undefined;
    this.deps.detach?.();
  }
  private scheduleWarmup(epoch: number) {
    this.clearWarmup();
    this.warmupTimer = setTimeout(() => {
      if (epoch === this.requestEpoch && this.snapshotValue.state === "warm-up")
        this.setSnapshot({ reason: undefined, state: "ready" });
    }, CAMERA_WARMUP_MS);
  }
  private clearWarmup() {
    if (this.warmupTimer) clearTimeout(this.warmupTimer);
    this.warmupTimer = undefined;
  }
  private setError(error: unknown) {
    const name =
      typeof error === "object" && error !== null && "name" in error
        ? String(error.name)
        : "";
    if (name === "PlaybackError") {
      this.setSnapshot({
        permission: "granted",
        reason: "playback-unavailable",
        state: "recoverable-error",
      });
      return;
    }
    const reason = mapCameraError(error);
    this.setSnapshot({
      permission:
        reason === "denied-permission"
          ? "denied"
          : this.snapshotValue.permission,
      reason,
      state: "recoverable-error",
    });
  }
  private setSnapshot(change: Partial<CameraSnapshot>) {
    this.snapshotValue = { ...this.snapshotValue, ...change };
    this.record(`state:${this.snapshotValue.state}`);
    if (this.snapshotValue.reason)
      this.record(`reason:${this.snapshotValue.reason}`);
    this.emit();
  }
  private record(event: string) {
    this.snapshotValue = {
      ...this.snapshotValue,
      diagnostics: [...this.snapshotValue.diagnostics, event].slice(
        -MAX_DIAGNOSTIC_EVENTS,
      ),
    };
  }
  private emit() {
    this.listeners.forEach((listener) => listener(this.snapshotValue));
  }
}
