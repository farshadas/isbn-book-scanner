# ISBN Book Scanner

A mobile-first barcode scanner that:

1. Collects a required student first name, last name, and grade from K through 8.
2. Scans up to five ISBN barcodes with the phone camera, or accepts a typed or locally dictated title.
3. Looks up each title and author using Open Library, with Google Books as a fallback.
4. Saves one student row with five `Title — Author` columns in the selected grade tab of a Google Sheet.

The site is static. Submissions are sent to a Google Apps Script web app bound to the destination Sheet.

Book-title dictation runs in a browser worker with a cached Whisper model. Recorded audio is processed
on the device and is not sent to the Sheet endpoint or a transcription service. Only the model files are
cached; the recording is held in memory, zeroed after transcription, and never written to browser storage.

The Apps Script source is in `apps-script/Code.gs`. Run `setupGradeSheets` once, then deploy it as a web app that executes as the Sheet owner and is accessible to anyone.

## Run locally

Camera access requires HTTPS or localhost.

```sh
python3 -m http.server 4173
```

Open `http://localhost:4173`.
