# URA Property Analytics Platform

A full-stack property analytics platform for Singapore real estate data using URA API.

## Features

- 📊 **District Comparison** - Compare property prices across districts
- 🏠 **Property Type Breakdown** - Analyze by Condominium, Apartment, etc.
- 🔍 **Search & Filter** - Find projects by name, district, or price range

## Project Structure

```
ura-analytics/
├── backend/           # Express API server
│   ├── src/
│   │   ├── index.js          # Server entry point
│   │   ├── routes/
│   │   │   └── ura.js        # URA API routes
│   │   └── services/
│   │       └── uraService.js # URA API integration
│   ├── .env.example
│   └── package.json
│
├── frontend/          # React + Vite app
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── DistrictChart.jsx
│   │   │   ├── PropertyTypeChart.jsx
│   │   │   └── ProjectSearch.jsx
│   │   └── services/
│   │       └── api.js
│   └── package.json
│
└── README.md
```

## Quick Start

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your URA API credentials
npm run dev
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### 3. Open http://localhost:5173

## Environment Variables

Create `backend/.env`:

```
URA_ACCESS_KEY=your_access_key
```

That's it! The token is **automatically fetched and refreshed daily**.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/transactions` | Get all transactions (with optional filters) |
| `GET /api/districts/summary` | District-wise price summary |
| `GET /api/property-types/summary` | Property type breakdown |
| `GET /api/projects/search?q=` | Search projects by name |

## Tech Stack

- **Backend:** Node.js, Express, Axios
- **Frontend:** React, Vite, Recharts, TailwindCSS
- **Data Source:** URA DataService API
