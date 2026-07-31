import { createBrowserVisionDependencies } from "./runtime-loader";
import { createVisionWorkerRuntime } from "./worker-runtime";

const runtime = createVisionWorkerRuntime(
  createBrowserVisionDependencies(),
  (event) => self.postMessage(event),
);
self.addEventListener("message", (event: MessageEvent<unknown>) => {
  runtime.receive(event.data);
});
