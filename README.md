# Excel PDF Batch Converter

複数のExcelファイルをGitHub Actions上でPDFへ一括変換する静的Webツールです。

フロントエンドはGitHub Pagesでホストし、変換処理はUbuntu runner上で実行します。変換前に、指定したシート・セル範囲・行範囲・列範囲を削除できます。

## Repository Layout

```text
docs/
  index.html
  styles.css
  app.js
scripts/
  convert_excel_to_pdf.py
  requirements.txt
.github/
  workflows/
    convert-excel-to-pdf.yml
examples/
  job-config.example.json
```

## Features

- 複数 `.xlsx` ファイルのアップロード
- 全ファイル共通ルールとファイル別ルール
- 削除方式:
  - 値のみクリア
  - 行ごと物理削除
  - 列ごと物理削除
- GitHub Actions上でLibreOffice headless変換
- 変換後PDFをartifact ZIPとしてダウンロード
- ブラウザ画面で進捗とログを表示
- HTTPS実行ガード、CSP、Referrer Policy、Permissions Policy

## GitHub Pages Setup

1. Push this repository to GitHub.
2. Open `Settings` > `Pages`.
3. Set `Source` to `Deploy from a branch`.
4. Select the default branch and `/docs`.
5. Enable `Enforce HTTPS`.
6. Save and open the published Pages URL.

Use only the `https://` Pages URL for real jobs. The app redirects plain HTTP to HTTPS outside localhost and blocks token use when the page is not running in a secure browser context.

## Required Token

The browser app calls the GitHub API directly. Create a fine-grained personal access token for this repository with:

- Metadata: Read
- Contents: Read and write
- Actions: Read and write

The app uses the token only in browser memory and does not save it to `localStorage`.

## How It Works

1. Select one or more `.xlsx` files in the GitHub Pages app.
2. Add deletion rules in common settings or per-file settings.
3. Enter the repository owner, repository name, and fine-grained PAT.
4. Click `変換実行`.
5. The app creates a temporary branch named `excel-pdf-jobs/{jobId}`.
6. The app uploads Excel files and `job-config.json` to `jobs/{jobId}`.
7. The app triggers `.github/workflows/convert-excel-to-pdf.yml`.
8. GitHub Actions installs LibreOffice and Python dependencies.
9. `scripts/convert_excel_to_pdf.py` applies openpyxl edits and runs LibreOffice headless conversion.
10. The converted PDFs and `conversion-report.json` are uploaded as the `converted-pdf-zip` artifact. GitHub serves the artifact download as a ZIP file.

## Deletion Rules

Rules support these modes:

- `clear_values`: clear cell values only. Use ranges like `A1:C10`.
- `delete_rows`: physically delete rows. Use ranges like `5:10` or `A5:C10`.
- `delete_columns`: physically delete columns. Use ranges like `A:C` or `A1:C10`.

The UI separates sheet name and range, but ranges like `Sheet1!A1:C10` are also accepted.

## Error Handling and Logs

- Browser logs show upload, workflow dispatch, Actions status, and artifact download progress.
- GitHub Actions logs show each file's edit and conversion stage.
- `conversion-report.json` is included in the artifact when conversion reaches the reporting stage.
- If one file fails, the script continues with the remaining files and exits with failure after writing the report.

## Security Notes

- Do not use a broad classic PAT unless absolutely necessary.
- Prefer a fine-grained PAT scoped to only this repository.
- Set the token expiration as short as practical.
- Open the app only from GitHub Pages with `Enforce HTTPS` enabled.
- The static app ships a restrictive Content Security Policy, no-referrer policy, and permissions policy.
- The PAT field is cleared after each run and is not persisted by the app.
- Uploaded Excel files are committed temporarily to a job branch.
- The workflow attempts to delete the temporary branch after completion.
- Artifacts are retained for 3 days.
- Do not upload files containing data that should not be stored in GitHub repository history.

## Higher Security Option

For stronger security than a static-only GitHub Pages app can provide, replace direct PAT entry with a small trusted backend or GitHub App:

- GitHub App installation tokens instead of user PATs
- Server-side token storage and rotation
- Presigned upload storage instead of committing input files to repository history
- Server-issued short-lived job tokens for the browser

That architecture avoids exposing GitHub write credentials to the browser, but it requires hosting a backend service in addition to GitHub Pages.
