const FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdCtTHn1Oep3eFnlfVF6f9iRBu69BNU6KRT0GxSxPgw3U9kQw/viewform";
const FORM_FIELDS = [
  "entry.1619479579",
  "entry.1371399774",
  "entry.378340362",
  "entry.1985276319",
  "entry.631929317",
];
const MAX_BOOKS = FORM_FIELDS.length;

const state = {
  books: [],
  scanner: null,
  scanning: false,
  processing: false,
};

const elements = {
  reader: document.querySelector("#reader"),
  placeholder: document.querySelector("#scanner-placeholder"),
  scanButton: document.querySelector("#scan-button"),
  cancelScanButton: document.querySelector("#cancel-scan-button"),
  status: document.querySelector("#status"),
  counter: document.querySelector("#counter"),
  booksSection: document.querySelector("#books-section"),
  bookList: document.querySelector("#book-list"),
  formButton: document.querySelector("#form-button"),
  manualForm: document.querySelector("#manual-form"),
  manualIsbn: document.querySelector("#manual-isbn"),
};

elements.scanButton.addEventListener("click", startScanner);
elements.cancelScanButton.addEventListener("click", stopScanner);
elements.formButton.addEventListener("click", openPrefilledForm);
elements.manualForm.addEventListener("submit", handleManualEntry);

function normalizeIsbn(value) {
  return String(value).replace(/[^0-9X]/gi, "").toUpperCase();
}

function isValidIsbnLength(isbn) {
  return isbn.length === 10 || isbn.length === 13;
}

async function startScanner() {
  if (state.books.length >= MAX_BOOKS) return;
  if (typeof Html5Qrcode === "undefined") {
    setStatus("The scanner could not load. Check your connection and try again.", true);
    return;
  }

  setStatus("Allow camera access when your browser asks.");
  state.scanner = new Html5Qrcode("reader");
  state.scanning = true;
  elements.reader.hidden = false;
  elements.placeholder.hidden = true;
  elements.scanButton.hidden = true;
  elements.cancelScanButton.hidden = false;

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
    setStatus("Camera access failed. Check Safari camera permissions or type the ISBN below.", true);
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

  try {
    state.scanner?.pause(true);
  } catch (error) {
    console.warn("Could not pause scanner", error);
  }

  await addBook(isbn);
  state.processing = false;

  if (state.books.length >= MAX_BOOKS) {
    await stopScanner();
    renderBooks();
    setStatus("Five books are ready. Open the filled Google Form.");
    return;
  }

  window.setTimeout(() => {
    if (!state.scanning || state.processing || state.books.length >= MAX_BOOKS) return;
    try {
      state.scanner?.resume();
    } catch (error) {
      console.warn("Could not resume scanner", error);
      setStatus("Tap Cancel scan, then start the camera again.", true);
    }
  }, 900);
}

async function stopScanner() {
  if (state.scanner && state.scanning) {
    try {
      await state.scanner.stop();
    } catch (error) {
      console.warn("Could not stop scanner cleanly", error);
    }
  }
  await resetScanner();
}

async function resetScanner() {
  if (state.scanner) {
    try {
      state.scanner.clear();
    } catch (error) {
      console.warn("Could not clear scanner", error);
    }
  }

  state.scanner = null;
  state.scanning = false;
  elements.reader.hidden = true;
  elements.placeholder.hidden = state.books.length >= MAX_BOOKS;
  elements.scanButton.hidden = state.books.length >= MAX_BOOKS;
  elements.cancelScanButton.hidden = true;
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
    setStatus("That book is already in the list. Point the camera at the next book.", true);
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
      ? `Found “${book.title}”${book.authors ? ` by ${book.authors}` : ""}.${
          state.books.length < MAX_BOOKS ? " Point the camera at the next book." : ""
        }`
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
      updateFormButton();
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

  updateFormButton();
}

function updateFormButton() {
  elements.formButton.disabled =
    state.books.length === 0 || state.books.some((book) => !book.title.trim());
}

function openPrefilledForm() {
  const url = new URL(FORM_URL);
  url.searchParams.set("usp", "pp_url");

  state.books.forEach((book, index) => {
    const value = formatBookEntry(book);
    if (value) url.searchParams.set(FORM_FIELDS[index], value);
  });

  window.location.href = url.toString();
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
  getPrefilledUrl(books) {
    const url = new URL(FORM_URL);
    url.searchParams.set("usp", "pp_url");
    books.slice(0, MAX_BOOKS).forEach((book, index) => {
      const value = formatBookEntry(book);
      if (value) url.searchParams.set(FORM_FIELDS[index], value);
    });
    return url.toString();
  },
};
