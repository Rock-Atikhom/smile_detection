import { createBrowserVisionDependencies } from "./runtime-loader";
import { isVisionWorkerEvent } from "./protocol";
import { createVisionWorkerRuntime } from "./worker-runtime";

const runtime = createVisionWorkerRuntime(
  createBrowserVisionDependencies(),
  (event) => {
    if (isVisionWorkerEvent(event)) {
      self.postMessage(event);
    }
  },
);
self.addEventListener("message", (event: MessageEvent<unknown>) => {
  runtime.receive(event.data);
});
