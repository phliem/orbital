# Orbital — title review

A commercial real estate lawyer should not have to invent the same title questions on every file. This prototype reviews one uploaded PDF and returns findings for the persona in front of them.

Two personas are defined in `backend/config/personas.yaml`. **Residential Developer** is any residential developer or buyer. **Commercial Tenant** is any commercial tenant. Willowbank Homes LLC and Northstar Burger Co. are example clients of those personas. Each persona has its own five categories. The first successful report locks its persona to the uploaded PDF. To review with another persona, remove the PDF and upload it again, or upload it in a new project.

The app is the starter stack: React 18, Vite, FastAPI, and Postgres.

## The findings

Residential Developer asks: Height and massing, Easements over the buildable area, Monetary encumbrances, Use restrictions, and Access.

Commercial Tenant asks: Permitted use and use restrictions, Easements across the premises, Access and shared drives, Security interests and occupation, and Building limits.

The model may return several findings for one category, one per distinct clause. A category the document does not address is a single Not found card. The prompt does not assign a risk in advance. Risk is the model's, for that persona, and only when the quote survives.

Each finding separates **Document.** (the verified quote) from **For** the persona. A quote that is missing, shorter than 20 characters and 4 words, or not in the extracted text is dropped, and that finding's risk goes with it. If nothing for that category survives, the card is Not found.

**See evidence in document** is shown only after the excerpt is found in the PDF. The reader jumps to that page and flashes the clause.

Commercial Lease and Environmental assessments start with no built-in checks. Add a check takes a free-text instruction. The model returns one card per distinct matching item, with a short title for that item. Several cards sit under the instruction. Not found is used only when none of them verify. The same rule applies to a custom check on a title report.

An unticked category is listed in the prompt as excluded and left out of the report. Its subject matter is not filed under a selected category. A finding whose category was not enabled is dropped. A stored report is reused only when the checks that were sent are the ones left ticked.

## The app

The sidebar is **Analysis**, **Chat**, **Documents**, **Manage project**. A new project opens on Analysis.

### Set up your review

After the PDF is uploaded, setup is three steps:

1. Choose a persona. Willowbank Homes LLC is the example Residential Developer. Northstar Burger Co. is the example Commercial Tenant.
2. Choose the document type: Commercial Lease, Environmental assessments, Title report. Title report stays selected.
3. Confirm the checks. A title report lists that persona's five categories, and each can be ticked. Commercial Lease and Environmental assessments start empty. Add a check takes a free-text instruction, then tick it. Run report stays off until one check is selected.

Run report sends the client, the document type, and the selected checks. A set key calls the configured model. Citations are checked against the uploaded PDF. The review requires extractable text, so use a searchable PDF. With no API key, Run report and Chat fail with “No LLM API key configured. Set ANTHROPIC_API_KEY/OPENAI_API_KEY in .env” (HTTP 503). They do not show a recorded reading or Not found rows. Regex address extraction still runs on upload without a key. A model-returned address is stored only when that address appears in the extracted text.

### Analysis

The header lists Type. Once a client is chosen it also lists To and Property. Property is the address extracted from the PDF, the same address used as the default project title. The row says “Not found in this document.” when no address was detected. A later rename leaves that extracted address in place.

Each finding has two toggles: Follow-up / Flagged, and Resolved. They are independent. All is the default and shows every finding. Flagged, Resolved, and the severity chips narrow the list, and they can be combined. All clears both the severity chips and the Flagged / Resolved filter. Resolved marks are saved with the report. Flagged marks last for the session. A new report starts with no resolved marks.

Search document, on Analysis and Documents, highlights the matched letters in the PDF and counts occurrences.

Document checks on Analysis is a read-only summary of the checks sent with that report. A sent check has a tick. An unticked check is marked Not analysed.

### Documents, Chat, Manage project

Documents lists the one PDF beside the same viewer and can delete that file, which also deletes the generated checklist. Add documents is disabled and marked Coming soon. A second upload is rejected.

Chat is grounded in the current upload. Replacing the PDF starts a fresh document chat. With no API key the tab shows the same missing-key error and does not call a model.

Manage project renames the project and deletes it. The title field starts from the current name. Enter or Save stores a trimmed title of at most 120 characters. Save stays off when the field is empty or unchanged. Uploading a PDF names the project after the property street address, without the APN or the price. The Becker commitment becomes 733 Becker Station Road, Fairmont Crossing, Colorado 80991. A project someone already renamed is left alone. If the file has no address, the title stays Untitled project. Delete project asks for confirmation, then removes the PDF, messages, and the checklist.

## Setup

### Prerequisites

- Docker and Docker Compose
- [just](https://github.com/casey/just)

### Run it

```bash
just setup
just dev
```

Alembic upgrades existing databases from the original schema in place when the backend starts. Existing projects, uploads, and messages are kept.

`just dev` rebuilds images when `frontend/package.json` or the lockfile changed. The frontend container keeps `node_modules` from the image, not from a volume. A dependency added in the lockfile, including `react-resizable-panels`, is missing until that image is rebuilt. If Vite says it failed to resolve a package:

```bash
docker compose build frontend && docker compose up
```

Open http://localhost:5173.

1. New project. It opens on Analysis.
2. Upload `sample-docs/alta-title-commitment-733-becker-station.pdf`.
3. Choose Residential Developer (Willowbank Homes LLC), leave Title report selected, and run the report.
4. Open a finding and use See evidence in document.
5. To review as Commercial Tenant, remove the PDF from Documents and upload it again, or start a new project with the same PDF.

`just setup` copies `.env.example` to `.env`. Set a key before running a report or using chat. With neither key set, those actions show the missing-key error. Upload still names the project from the address regex.

```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key_here
```

Or `LLM_PROVIDER=openai` with `OPENAI_API_KEY`. The starter already supports both providers. This repo does not ship a key.

To see a generation failure in the UI, run this in the browser console and then click Run report. It applies once:

```js
sessionStorage.setItem("orbital-force-checklist-error", "1")
```

### Checks

```bash
just test
```

That runs the checks in the backend container. The Becker expectation file, used by tests and not by the running app, maps five quotes onto each persona's categories. A forged excerpt and a quote of only a few words are Not found, and the write-up is dropped with them. A canned Document line is kept only when that sentence is in the file. A non-matching PDF is Not found. An unticked category is left out of the request and the report, and its subject matter is not filed under another category. An instruction that matches three incidents returns three cards, and an invented incident is dropped. Generation or chat with no API key returns the missing-key error and does not call the model. A model address that is not in the text is not stored. Renaming trims the title and rejects a blank one. Deleting a project or its PDF removes the file and the checklist. The Becker upload names the project 733 Becker Station Road, Fairmont Crossing, Colorado 80991. A renamed project keeps its title. A file with no address keeps Untitled project.

`just check` is lint and types. Other recipes: `just stop`, `just reset`, `just logs-backend`, `just fmt`.

## What this leaves out

- Add new client
- Adding another document. Add documents stays Coming soon, and a project still holds one PDF
- A recorded checklist in the product. Tests can still replay the Becker reading. A commercial lease or an environmental assessment has no recording
- Email ingest and a mobile layout

