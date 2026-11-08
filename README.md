# ISBN Book Scanner

A mobile-first barcode scanner that:

1. Scans up to five ISBN barcodes with the phone camera.
2. Looks up each title and author using Open Library, with Google Books as a fallback.
3. Opens a Google Form with up to five `Title — Author` entries prefilled.

The site is static and stores no data. The user reviews and submits the final Google Form.

## Run locally

Camera access requires HTTPS or localhost.

```sh
python3 -m http.server 4173
```

Open `http://localhost:4173`.
