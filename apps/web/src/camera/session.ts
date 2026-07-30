export const CAMERA_PERMISSION_TIMEOUT_MS = 15_000;
export const CAMERA_WARMUP_MS = 1_200;
const MAX_DIAGNOSTIC_EVENTS = 20;

export type CameraState =
  | "privacy-introduction"
  | "permission-pending"
  | "camera-starting"
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
  | "switch-failed";

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
  ) => Promise<{ height: number; width: number }>;
  detach?: () => void;
  enumerateDevices: () => Promise<MediaDeviceInfo[]>;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  isMobile: () => boolean;
  isSecureContext: () => boolean;
  restore?: (stream: MediaStream) => void;
};

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
  else if (facingMode) video.facingMode = { ideal: facingMode };
  return { audio: false, video };
}

export class CameraSession {
  private activeStream: MediaStream | undefined;
  private activeTrack: MediaStreamTrack | undefined;
  private activeBeforeHide = false;
  private cancelPendingRequest: (() => void) | undefined;
  private deviceIds: string[] = [];
  private deviceIndex = 0;
  private listeners = new Set<(snapshot: CameraSnapshot) => void>();
  private requestEpoch = 0;
  private snapshotValue = createInitialCameraSnapshot();
  private warmupTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: CameraSessionDependencies) {}

  get snapshot(): CameraSnapshot {
    return this.snapshotValue;
  }

  subscribe(listener: (snapshot: CameraSnapshot) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start() {
    if (!this.deps.isSecureContext()) {
      this.setSnapshot({
        permission: "unknown",
        reason: "insecure-context",
        state: "recoverable-error",
      });
      return;
    }
    await this.acquire(initialConstraints(this.deps.isMobile()), false);
  }

  async restart() {
    this.stopActive();
    await this.start();
  }

  async switchCamera() {
    if (!this.activeStream || !this.snapshotValue.canSwitch) return;
    const oldSnapshot = this.snapshotValue;
    const oldStream = this.activeStream;
    const oldTrack = this.activeTrack;
    const nextDeviceId =
      this.deviceIds.length > 1
        ? this.deviceIds[(this.deviceIndex + 1) % this.deviceIds.length]
        : undefined;
    const currentFacingMode = oldTrack?.getSettings().facingMode;
    const alternateFacing =
      currentFacingMode === "user" ? "environment" : "user";

    const switched = await this.acquire(
      switchedConstraints(nextDeviceId, alternateFacing),
      true,
    );
    if (!switched) {
      this.activeStream = oldStream;
      this.activeTrack = oldTrack;
      this.deps.restore?.(oldStream);
      this.setSnapshot({
        ...oldSnapshot,
        reason: "switch-failed",
        state: "ready",
      });
      return;
    }
    if (nextDeviceId)
      this.deviceIndex = (this.deviceIndex + 1) % this.deviceIds.length;
  }

  stop() {
    this.stopActive();
    this.setSnapshot({
      permission: this.snapshotValue.permission,
      reason: undefined,
      state: "stopped",
    });
  }

  setVisibility(visible: boolean): Promise<void> | void {
    if (!visible) {
      this.activeBeforeHide = Boolean(this.activeStream);
      if (this.activeBeforeHide) {
        this.stopActive();
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
    return this.start();
  }

  async reconstructForOrientation() {
    if (!this.activeStream) return;
    this.stopActive();
    await this.start();
  }

  dispose() {
    this.requestEpoch += 1;
    this.activeBeforeHide = false;
    this.stopActive();
    this.listeners.clear();
  }

  private async acquire(
    constraints: MediaStreamConstraints,
    isSwitch: boolean,
  ) {
    const epoch = ++this.requestEpoch;
    this.clearWarmup();
    this.setSnapshot({
      permission: "prompt",
      reason: undefined,
      state: isSwitch ? "camera-starting" : "permission-pending",
    });

    let stream: MediaStream;
    try {
      stream = await this.requestWithTimeout(constraints, epoch);
    } catch (error) {
      if (epoch !== this.requestEpoch) return false;
      const reason = mapCameraError(error);
      this.setSnapshot({
        permission:
          reason === "denied-permission"
            ? "denied"
            : this.snapshotValue.permission,
        reason,
        state: "recoverable-error",
      });
      return false;
    }
    if (epoch !== this.requestEpoch) {
      stopTracks(stream);
      return false;
    }

    this.setSnapshot({
      permission: "granted",
      reason: undefined,
      state: "camera-starting",
    });
    try {
      const decoded = await this.deps.attachAndPlay(stream);
      if (epoch !== this.requestEpoch) {
        stopTracks(stream);
        return false;
      }
      const track = stream.getVideoTracks()[0];
      if (!track) throw { name: "NotFoundError" };
      const settings = track.getSettings();
      const capabilities = track.getCapabilities?.();
      const canSwitch =
        this.deviceIds.length > 1 ||
        (Array.isArray(capabilities?.facingMode) &&
          capabilities.facingMode.length > 1);
      const priorStream = this.activeStream;
      this.activeStream = stream;
      this.activeTrack = track;
      track.addEventListener("ended", () => this.handleTrackEnded(stream));
      if (priorStream && priorStream !== stream) stopTracks(priorStream);
      this.snapshotValue = {
        ...this.snapshotValue,
        canSwitch,
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
      this.warmupTimer = setTimeout(() => {
        if (
          epoch !== this.requestEpoch ||
          this.snapshotValue.state !== "warm-up"
        )
          return;
        this.setSnapshot({ state: "ready" });
      }, CAMERA_WARMUP_MS);
      return true;
    } catch (error) {
      stopTracks(stream);
      if (epoch === this.requestEpoch) {
        this.setSnapshot({
          reason: mapCameraError(error),
          state: "recoverable-error",
        });
      }
      return false;
    }
  }

  private async requestWithTimeout(
    constraints: MediaStreamConstraints,
    epoch: number,
  ): Promise<MediaStream> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (this.cancelPendingRequest === cancel) {
          this.cancelPendingRequest = undefined;
        }
      };
      const cancel = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        finish();
        reject({ name: "AbortError" });
      };
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        finish();
        reject({ name: "IgnoredPromptError" });
      }, CAMERA_PERMISSION_TIMEOUT_MS);
      this.cancelPendingRequest = cancel;
      let request: Promise<MediaStream>;
      try {
        request = this.deps.getUserMedia(constraints);
      } catch (error) {
        clearTimeout(timeout);
        settled = true;
        finish();
        reject(error);
        return;
      }
      request.then(
        (stream) => {
          if (settled || epoch !== this.requestEpoch) {
            stopTracks(stream);
            return;
          }
          settled = true;
          clearTimeout(timeout);
          finish();
          resolve(stream);
        },
        (error: unknown) => {
          if (settled || epoch !== this.requestEpoch) return;
          settled = true;
          clearTimeout(timeout);
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
      this.setSnapshot({
        canSwitch: this.deviceIds.length > 1 || this.snapshotValue.canSwitch,
      });
    } catch {
      // A running session does not need device enumeration to remain usable.
    }
  }

  private handleTrackEnded(stream: MediaStream) {
    if (stream !== this.activeStream) return;
    this.requestEpoch += 1;
    this.clearWarmup();
    stopTracks(stream);
    this.activeStream = undefined;
    this.activeTrack = undefined;
    this.deps.detach?.();
    this.setSnapshot({ reason: "interruption", state: "recoverable-error" });
  }

  private stopActive() {
    this.requestEpoch += 1;
    this.cancelPendingRequest?.();
    this.clearWarmup();
    stopTracks(this.activeStream);
    this.activeStream = undefined;
    this.activeTrack = undefined;
    this.deps.detach?.();
  }

  private clearWarmup() {
    if (this.warmupTimer) clearTimeout(this.warmupTimer);
    this.warmupTimer = undefined;
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
