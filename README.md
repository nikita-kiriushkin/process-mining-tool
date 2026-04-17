# Process Mining Tool

An interactive web application for visualising and analysing operational processes from event logs.

## Features

- CSV event log upload with drag-and-drop
- Column mapping UI with live preview
- Directed-Follows Graph (DFG) process map
- Interactive node and edge inspection
- Filters: date range, activities, edge frequency, process variants, dimensions (region, team, etc.)
- Top variants table
- Summary statistics: total cases, events, average case length, start/end activities

## Quick Start (Docker)

```bash
docker-compose up --build
```

Open [http://localhost:3000](http://localhost:3000).

> On first run Docker pulls base images and installs dependencies — expect ~2 min.

## Local Development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

App: [http://localhost:3000](http://localhost:3000)

## Running Tests

```bash
cd backend
pytest tests/ -v
```

## Sample Data

Upload `sample-data/lead-funnel.csv` to try the tool immediately.

It contains 20 lead funnel cases with activities:

```
Lead Created → Email Sent → Call Scheduled → Call Completed
    → Proposal Sent → Contract Signed  (happy path)
    → Demo Scheduled → Demo Completed → Proposal Sent  (with demo)
    → Negotiation → Contract Signed
    → Lead Lost  (drop-off)
    → Call No Show → (retry)  (loop)
```

## CSV Format

| Column | Required | Description |
|--------|----------|-------------|
| `case_id` | Yes | Unique identifier per process instance |
| `activity_name` | Yes | Name of the process step |
| `timestamp` | Yes | When the event occurred (ISO 8601 or `YYYY-MM-DD HH:MM:SS`) |
| `resource` | No | Person or system executing the step |
| `team` | No | Team dimension |
| `region` | No | Geographic dimension |
| `status` | No | Status dimension |

Any column name works — you map them in the UI after upload.

## Architecture

```
frontend/   Next.js 14 + TypeScript + Tailwind CSS + Cytoscape.js
backend/    FastAPI + pandas (no heavy ML dependencies)
```

### Key design decisions

- **No database** — CSV files are held in memory as temporary files per session; suitable for MVP/single-user use
- **Custom mining logic** — DFG construction, variant extraction, and metrics are implemented with pandas rather than pm4py, keeping the image small and the logic transparent
- **Cytoscape.js** — chosen over React Flow because process graphs often have cycles and high edge density; dagre layout produces clean hierarchical process maps out of the box

## Project Structure

```
process-mining-tool/
├── docker-compose.yml
├── sample-data/
│   └── lead-funnel.csv
├── backend/
│   ├── main.py
│   ├── api/
│   │   ├── routes/       upload.py  process.py
│   │   └── schemas/      upload.py  process.py
│   ├── core/
│   │   ├── parser.py     CSV parsing + validation
│   │   ├── miner.py      DFG construction + metrics
│   │   ├── variants.py   Variant extraction
│   │   └── filters.py    Filter application
│   └── tests/
└── frontend/
    └── src/
        ├── app/          upload/  map/  explore/
        ├── components/   graph/  filters/  details/  metrics/
        ├── lib/          api.ts  types.ts  utils.ts
        └── store/        uploadStore.ts  exploreStore.ts
```
