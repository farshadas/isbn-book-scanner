const SUBMISSION_URL =
  "https://script.google.com/macros/s/AKfycbxv0Oc-AKY67Iuy6uCBLQ3FZCOD7MoZU779gobi1Tuhmd0yKxb72oB31SBUmZE_G4qR/exec";
const MAX_BOOKS = 5;

const state = {
  books: [],
  scanner: null,
  scannerKind: null,
  scanning: false,
  processing: false,
  submitted: false,
  voiceWorker: null,
  voiceStream: null,
  voiceRecorder: null,
  voiceChunks: [],
  voicePressed: false,
  recordingVoice: false,
  transcribingVoice: false,
};

const elements = {
  studentForm: document.querySelector("#student-form"),
  firstName: document.querySelector("#first-name"),
  lastName: document.querySelector("#last-name"),
  grade: document.querySelector("#grade"),
  reader: document.querySelector("#reader"),
  placeholder: document.querySelector("#scanner-placeholder"),
  scanButton: document.querySelector("#scan-button"),
  cancelScanButton: document.querySelector("#cancel-scan-button"),
  status: document.querySelector("#status"),
  counter: document.querySelector("#counter"),
  booksSection: document.querySelector("#books-section"),
  bookList: document.querySelector("#book-list"),
  submitButton: document.querySelector("#submit-button"),
  resetButton: document.querySelector("#reset-button"),
  submitStatus: document.querySelector("#submit-status"),
  manualForm: document.querySelector("#manual-form"),
  manualTitle: document.querySelector("#manual-title"),
  titleField: document.querySelector("#title-field"),
  clearTitle: document.querySelector("#clear-title"),
  voiceButton: document.querySelector("#voice-button"),
  voiceLabel: document.querySelector("#voice-label"),
  voiceStatus: document.querySelector("#voice-status"),
};

elements.scanButton.addEventListener("click", startScanner);
elements.cancelScanButton.addEventListener("click", stopScanner);
elements.submitButton.addEventListener("click", submitBookList);
elements.resetButton.addEventListener("click", resetForNextStudent);
elements.manualForm.addEventListener("submit", handleManualEntry);
elements.clearTitle.addEventListener("click", () => {
  elements.manualTitle.value = "";
  elements.manualTitle.focus();
});
elements.voiceButton.addEventListener("pointerdown", startVoiceCapture);
window.addEventListener("pointerup", stopVoiceCapture);
window.addEventListener("pointercancel", stopVoiceCapture);
elements.voiceButton.addEventListener("keydown", handleVoiceKeyDown);
elements.voiceButton.addEventListener("keyup", handleVoiceKeyUp);
window.addEventListener("load", () => setTimeout(preloadVoiceModel, 0), { once: true });

function normalizeIsbn(value) {
  return String(value).replace(/[^0-9X]/gi, "").toUpperCase();
}

function isValidIsbnLength(isbn) {
  return isbn.length === 10 || isbn.length === 13;
}

async function startScanner() {
  if (state.books.length >= MAX_BOOKS) return;
  if (isIosDevice()) {
    await startZxingScanner();
    return;
  }
  await startHtml5Scanner();
}

function isIosDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function showScanner() {
  state.scanning = true;
  elements.reader.hidden = false;
  elements.placeholder.hidden = true;
  elements.scanButton.hidden = true;
  elements.cancelScanButton.hidden = false;
}

async function startZxingScanner() {
  if (typeof ZXingBrowser === "undefined") {
    setStatus("The scanner could not load. Check your connection and try again.", true);
    return;
  }

  setStatus("Allow camera access when your browser asks.");
  const video = document.createElement("video");
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  elements.reader.append(video);

  const reader = new ZXingBrowser.BrowserMultiFormatReader();
  reader.possibleFormats = [
    ZXingBrowser.BarcodeFormat.EAN_13,
    ZXingBrowser.BarcodeFormat.EAN_8,
    ZXingBrowser.BarcodeFormat.UPC_A,
    ZXingBrowser.BarcodeFormat.UPC_E,
  ];
  state.scannerKind = "zxing";
  state.scanner = { reader, controls: null };
  showScanner();

  try {
    const controls = await reader.decodeFromConstraints(
      {
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      video,
      (result, error, callbackControls) => {
        if (state.scannerKind === "zxing" && state.scanner) {
          state.scanner.controls = callbackControls;
        }
        if (result) handleScanSuccess(result.getText());
      }
    );
    if (state.scannerKind === "zxing" && state.scanner) {
      state.scanner.controls = controls;
    } else {
      controls.stop();
    }
  } catch (error) {
    console.error(error);
    await resetScanner();
    setStatus("Camera access failed. Check Safari camera permissions or type the ISBN below.", true);
  }
}

async function startHtml5Scanner() {
  if (typeof Html5Qrcode === "undefined") {
    setStatus("The scanner could not load. Check your connection and try again.", true);
    return;
  }

  setStatus("Allow camera access when your browser asks.");
  state.scannerKind = "html5";
  state.scanner = new Html5Qrcode("reader");
  showScanner();

  try {
    await state.scanner.start(
      { facingMode: "environment" },
      {
        fps: 12,
        qrbox: (width, height) => ({
          width: Math.min(width * 0.88, 420),
          height: Math.min(height * 0.34, 170),
        }),
        aspectRatio: 1.777,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ],
      },
      handleScanSuccess,
      () => {}
    );
  } catch (error) {
    console.error(error);
    await resetScanner();
    setStatus("Camera access failed. Check browser camera permissions or type the ISBN below.", true);
  }
}

async function handleScanSuccess(decodedText) {
  if (state.processing) return;
  state.processing = true;
  const isbn = normalizeIsbn(decodedText);

  if (!isValidIsbnLength(isbn)) {
    state.processing = false;
    setStatus("That barcode is not an ISBN. Try the barcode next to the ISBN number.", true);
    return;
  }

  await stopScanner();
  await addBook(isbn);
  state.processing = false;
}

async function stopScanner() {
  if (state.scanner && state.scanning) {
    try {
      if (state.scannerKind === "zxing") {
        state.scanner.controls?.stop();
      } else {
        await state.scanner.stop();
      }
    } catch (error) {
      console.warn("Could not stop scanner cleanly", error);
    }
  }
  await resetScanner();
}

async function resetScanner() {
  if (state.scanner && state.scannerKind === "html5") {
    try {
      state.scanner.clear();
    } catch (error) {
      console.warn("Could not clear scanner", error);
    }
  }

  state.scanner = null;
  state.scannerKind = null;
  state.scanning = false;
  replaceReader();
  elements.placeholder.hidden = state.books.length >= MAX_BOOKS;
  elements.scanButton.hidden = state.books.length >= MAX_BOOKS;
  elements.cancelScanButton.hidden = true;
}

function replaceReader() {
  const reader = document.createElement("div");
  reader.id = "reader";
  reader.className = "reader";
  reader.hidden = true;
  elements.reader.replaceWith(reader);
  elements.reader = reader;
}

async function handleManualEntry(event) {
  event.preventDefault();
  if (state.books.length >= MAX_BOOKS) {
    setStatus("Five books are already in the list.", true);
    return;
  }
  if (!elements.manualForm.reportValidity()) {
    return;
  }

  const title = elements.manualTitle.value.trim();
  state.books.push({ isbn: "", title, authors: "" });
  elements.manualForm.reset();
  renderBooks();
  setStatus(`Added “${title}”.`);
}

function handleVoiceKeyDown(event) {
  if ((event.key === " " || event.key === "Enter") && !event.repeat) {
    event.preventDefault();
    startVoiceCapture(event);
  }
}

function handleVoiceKeyUp(event) {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    stopVoiceCapture();
  }
}

async function startVoiceCapture(event) {
  event.preventDefault();
  if (state.recordingVoice || state.transcribingVoice) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    setVoiceStatus("Voice entry is not supported by this browser.", true);
    return;
  }

  state.voicePressed = true;
  ensureVoiceWorker();
  setVoiceStatus("Allow microphone access, then hold the button again.");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    if (!state.voicePressed) {
      stream.getTracks().forEach((track) => track.stop());
      setVoiceStatus("Hold the button while saying the book title.");
      return;
    }

    const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) =>
      MediaRecorder.isTypeSupported(type)
    );
    state.voiceStream = stream;
    state.voiceChunks = [];
    state.voiceRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    state.voiceRecorder.addEventListener("dataavailable", (voiceEvent) => {
      if (voiceEvent.data.size) state.voiceChunks.push(voiceEvent.data);
    });
    state.voiceRecorder.addEventListener("stop", transcribeVoiceCapture, { once: true });
    state.voiceRecorder.start();
    state.recordingVoice = true;
    elements.voiceButton.classList.add("recording");
    elements.voiceLabel.textContent = "Listening… release when done";
    setVoiceStatus("Say only the book title.");
  } catch (error) {
    console.error(error);
    state.voicePressed = false;
    setVoiceStatus("Microphone access was not available.", true);
  }
}

function stopVoiceCapture() {
  state.voicePressed = false;
  if (!state.recordingVoice || state.voiceRecorder?.state !== "recording") return;
  state.recordingVoice = false;
  state.voiceRecorder.stop();
  state.voiceStream?.getTracks().forEach((track) => track.stop());
  state.voiceStream = null;
  elements.voiceButton.classList.remove("recording");
  elements.voiceLabel.textContent = "Hold to say the book title";
  setVoiceStatus("Processing on this device…");
  showTypingDots(true);
}

async function transcribeVoiceCapture() {
  const chunks = state.voiceChunks;
  const mimeType = state.voiceRecorder?.mimeType;
  state.voiceChunks = [];
  state.voiceRecorder = null;
  if (!chunks.length) {
    showTypingDots(false);
    setVoiceStatus("No audio was recorded. Hold the button and try again.", true);
    return;
  }

  state.transcribingVoice = true;
  elements.voiceButton.disabled = true;
  try {
    let blob = new Blob(chunks, { type: mimeType });
    chunks.length = 0;
    const audio = await decodeVoiceAudio(blob);
    blob = null;
    ensureVoiceWorker().postMessage({ type: "transcribe", audio }, [audio.buffer]);
  } catch (error) {
    console.error(error);
    finishVoiceTranscription("The recording could not be processed.", true);
  }
}

async function decodeVoiceAudio(blob) {
  const context = new AudioContext();
  const decoded = await context.decodeAudioData(await blob.arrayBuffer());
  const mono = new Float32Array(decoded.length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const data = decoded.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      mono[index] += data[index] / decoded.numberOfChannels;
    }
    data.fill(0);
  }
  await context.close();
  if (decoded.sampleRate === 16000) return mono;

  const frames = Math.ceil(decoded.duration * 16000);
  const offline = new OfflineAudioContext(1, frames, 16000);
  const buffer = offline.createBuffer(1, mono.length, decoded.sampleRate);
  buffer.copyToChannel(mono, 0);
  mono.fill(0);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  buffer.getChannelData(0).fill(0);
  const resampled = new Float32Array(rendered.getChannelData(0));
  rendered.getChannelData(0).fill(0);
  return resampled;
}

function ensureVoiceWorker() {
  if (state.voiceWorker) return state.voiceWorker;
  state.voiceWorker = new Worker("voice-worker.js?v=5", { type: "module" });
  state.voiceWorker.addEventListener("message", ({ data }) => {
    if (data.type === "progress") {
      if (state.transcribingVoice) setVoiceStatus(data.message);
    } else if (data.type === "result") {
      const title = data.text.trim().replace(/^[“"' ]+|[”"' .]+$/g, "");
      if (title) {
        showTypingDots(false);
        elements.manualTitle.value = title;
        finishVoiceTranscription("");
      } else {
        finishVoiceTranscription("No title was heard. Try again closer to the microphone.", true);
      }
    } else if (data.type === "error") {
      finishVoiceTranscription("Voice entry could not load on this device.", true);
    }
  });
  state.voiceWorker.addEventListener("error", (error) => {
    console.error(error);
    state.voiceWorker.terminate();
    state.voiceWorker = null;
    if (state.transcribingVoice) {
      finishVoiceTranscription("Voice entry could not load on this device.", true);
    }
  });
  return state.voiceWorker;
}

function preloadVoiceModel() {
  if (!window.Worker || !navigator.mediaDevices?.getUserMedia) return;
  ensureVoiceWorker().postMessage({ type: "preload" });
}

function showTypingDots(visible) {
  if (visible) {
    state.titleBeforeVoice = elements.manualTitle.value;
    elements.manualTitle.value = "";
  } else if (elements.titleField.classList.contains("transcribing") && !elements.manualTitle.value) {
    elements.manualTitle.value = state.titleBeforeVoice || "";
  }
  elements.titleField.classList.toggle("transcribing", visible);
}

function finishVoiceTranscription(message, isError = false) {
  showTypingDots(false);
  state.transcribingVoice = false;
  elements.voiceButton.disabled = false;
  setVoiceStatus(message, isError);
}

function setVoiceStatus(message, isError = false) {
  elements.voiceStatus.textContent = message;
  elements.voiceStatus.classList.toggle("error", isError);
}

async function addBook(isbn) {
  if (state.books.length >= MAX_BOOKS) return;
  if (state.books.some((book) => book.isbn === isbn)) {
    setStatus("That book is already in the list. Tap Scan another book to continue.", true);
    return;
  }

  setStatus("Looking up the book title…");
  elements.scanButton.disabled = true;

  const book = await lookupBook(isbn);
  state.books.push({
    isbn,
    title: book?.title || "",
    authors: book?.authors || "",
  });

  renderBooks();
  elements.scanButton.disabled = false;
  setStatus(
    book?.title
      ? `Found “${book.title}”${book.authors ? ` by ${book.authors}` : ""}.`
      : "No title was found. Type it into the list before opening the form.",
    !book?.title
  );
}

async function lookupBook(isbn) {
  try {
    const key = `ISBN:${isbn}`;
    const openLibraryResponse = await fetch(
      `https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(key)}&format=json&jscmd=data`
    );
    if (openLibraryResponse.ok) {
      const openLibraryData = await openLibraryResponse.json();
      const record = openLibraryData[key];
      if (record?.title) {
        return {
          title: record.title,
          authors: record.authors?.map((author) => author.name).join(", ") || "",
        };
      }
    }
  } catch (error) {
    console.warn("Open Library lookup failed", error);
  }

  try {
    const googleResponse = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1`
    );
    if (googleResponse.ok) {
      const googleData = await googleResponse.json();
      const volume = googleData.items?.[0]?.volumeInfo;
      if (volume?.title) {
        return {
          title: volume.title,
          authors: volume.authors?.join(", ") || "",
        };
      }
    }
  } catch (error) {
    console.warn("Google Books lookup failed", error);
  }

  return null;
}

function renderBooks() {
  elements.bookList.replaceChildren();

  state.books.forEach((book, index) => {
    const item = document.createElement("li");
    item.className = "book";

    const number = document.createElement("span");
    number.className = "book-number";
    number.textContent = String(index + 1);

    const details = document.createElement("div");
    const title = document.createElement("input");
    title.className = "book-title";
    title.type = "text";
    title.value = book.title;
    title.placeholder = "Type book title";
    title.setAttribute("aria-label", `Book ${index + 1} title`);
    title.addEventListener("input", (event) => {
      state.books[index].title = event.target.value;
      updateSubmitButton();
    });

    const authors = document.createElement("input");
    authors.className = "book-author";
    authors.type = "text";
    authors.value = book.authors;
    authors.placeholder = "Type author";
    authors.setAttribute("aria-label", `Book ${index + 1} author`);
    authors.addEventListener("input", (event) => {
      state.books[index].authors = event.target.value;
    });

    details.append(title, authors);
    if (book.isbn) {
      const isbn = document.createElement("span");
      isbn.className = "book-isbn";
      isbn.textContent = `ISBN ${book.isbn}`;
      details.append(isbn);
    }

    const remove = document.createElement("button");
    remove.className = "remove-button";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove book ${index + 1}`);
    remove.addEventListener("click", () => {
      state.books.splice(index, 1);
      renderBooks();
      setStatus("");
    });

    item.append(number, details, remove);
    elements.bookList.append(item);
  });

  elements.counter.textContent = `${state.books.length} / ${MAX_BOOKS}`;
  elements.booksSection.hidden = state.books.length === 0;

  if (state.books.length >= MAX_BOOKS) {
    elements.scanButton.hidden = true;
    elements.placeholder.hidden = true;
  } else if (state.scanning) {
    elements.scanButton.hidden = true;
    elements.placeholder.hidden = true;
  } else {
    elements.scanButton.hidden = false;
    elements.placeholder.hidden = state.scanning;
    elements.scanButton.innerHTML =
      state.books.length === 0
        ? '<span aria-hidden="true">▣</span> Scan first book'
        : '<span aria-hidden="true">＋</span> Scan another book';
  }

  updateSubmitButton();
}

function updateSubmitButton() {
  elements.submitButton.disabled =
    state.books.length === 0 || state.books.some((book) => !book.title.trim());
}

async function submitBookList() {
  if (!elements.studentForm.reportValidity()) {
    elements.studentForm.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (state.books.length === 0 || state.submitted) return;

  const payload = new URLSearchParams({
    firstName: elements.firstName.value.trim(),
    lastName: elements.lastName.value.trim(),
    grade: elements.grade.value,
  });
  state.books.forEach((book, index) => {
    payload.set(`book${index + 1}`, formatBookEntry(book));
  });

  elements.submitButton.disabled = true;
  elements.submitButton.textContent = "Saving…";
  elements.submitStatus.textContent = "";
  elements.submitStatus.classList.remove("error");

  try {
    await fetch(SUBMISSION_URL, {
      method: "POST",
      mode: "no-cors",
      body: payload,
    });
    state.submitted = true;
    elements.submitButton.hidden = true;
    elements.resetButton.hidden = false;
    elements.submitStatus.textContent = `Saved for ${elements.firstName.value.trim()} in grade ${
      elements.grade.value
    }.`;
  } catch (error) {
    console.error(error);
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = "Submit book list";
    elements.submitStatus.textContent = "The list could not be saved. Check the connection and try again.";
    elements.submitStatus.classList.add("error");
  }
}

async function resetForNextStudent() {
  await stopScanner();
  state.books = [];
  state.submitted = false;
  elements.studentForm.reset();
  elements.grade.value = "";
  elements.manualForm.reset();
  setVoiceStatus("");
  setStatus("");
  elements.submitButton.hidden = false;
  elements.submitButton.textContent = "Submit book list";
  elements.resetButton.hidden = true;
  elements.submitStatus.textContent = "";
  elements.submitStatus.classList.remove("error");
  renderBooks();
  elements.firstName.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}

function formatBookEntry(book) {
  const title = book.title?.trim();
  const authors = book.authors?.trim();
  if (!title) return "";
  return authors ? `${title} — ${authors}` : title;
}

window.isbnScanner = {
  normalizeIsbn,
  isValidIsbnLength,
  lookupBook,
  formatBookEntry,
};
