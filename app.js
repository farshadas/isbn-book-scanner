const SUBMISSION_URL =
  "https://script.google.com/macros/s/AKfycbxw-jbLFaeOmJippEuPtszxnqrtC1t4NhQ-XxrJoy_WBvvB6NE-dINl__TlArDWllyA/exec";
const MAX_BOOKS = 5;

const state = {
  books: [],
  scanner: null,
  scannerKind: null,
  scanning: false,
  processing: false,
  submitted: false,
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
  manualIsbn: document.querySelector("#manual-isbn"),
};

elements.scanButton.addEventListener("click", startScanner);
elements.cancelScanButton.addEventListener("click", stopScanner);
elements.submitButton.addEventListener("click", submitBookList);
elements.resetButton.addEventListener("click", resetForNextStudent);
elements.manualForm.addEventListener("submit", handleManualEntry);

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
  const isbn = normalizeIsbn(elements.manualIsbn.value);
  if (!isValidIsbnLength(isbn)) {
    setStatus("Enter a 10 or 13 digit ISBN.", true);
    return;
  }

  elements.manualIsbn.value = "";
  await addBook(isbn);
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

    const isbn = document.createElement("span");
    isbn.className = "book-isbn";
    isbn.textContent = `ISBN ${book.isbn}`;
    details.append(title, authors, isbn);

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
