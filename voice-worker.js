import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriberPromise;

function getTranscriber() {
  if (!transcriberPromise) {
    self.postMessage({ type: "progress", message: "Loading the private speech model…" });
    transcriberPromise = pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny.en",
      {
        dtype: "q8",
        progress_callback(progress) {
          if (progress.status === "progress" && Number.isFinite(progress.progress)) {
            self.postMessage({
              type: "progress",
              message: `Loading speech model… ${Math.round(progress.progress)}%`,
            });
          }
        },
      }
    );
  }
  return transcriberPromise;
}

self.addEventListener("message", async ({ data }) => {
  if (data.type !== "transcribe") return;
  try {
    const transcriber = await getTranscriber();
    self.postMessage({ type: "progress", message: "Recognizing the title on this device…" });
    const result = await transcriber(data.audio, {
      chunk_length_s: 15,
      stride_length_s: 2,
    });
    self.postMessage({ type: "result", text: result.text || "" });
  } catch (error) {
    console.error(error);
    transcriberPromise = null;
    self.postMessage({ type: "error" });
  } finally {
    data.audio?.fill(0);
    data.audio = null;
  }
});
