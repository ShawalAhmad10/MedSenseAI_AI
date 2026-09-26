# MedSenseAI — Pharmacy Management System

A full-stack pharmacy management system with a pharmacist dashboard and a customer-facing storefront. Built as a Final Year Project.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Backend | Node.js + Express |
| Database | PostgreSQL (Sequelize ORM) |
| Auth | JWT (separate tokens for pharmacist & customer) |
| Styling | Custom CSS variables + Lucide icons |

---

## Project Structure

```
amnaMedcopy-main/
├── backend/                  # Node.js/Express API
│   ├── src/
│   │   ├── controllers/      # Business logic
│   │   ├── models/           # Sequelize models
│   │   ├── routes/           # API routes
│   │   ├── middleware/       # Auth middleware
│   │   ├── services/         # Batch allocation, FIFO
│   │   └── server.js         # Entry point
│   └── migrations/           # SQL migration scripts
│
└── medsense_ai/              # React frontend
    └── src/
        ├── pages/
        │   ├── dashboard/    # Pharmacist dashboard pages
        │   └── storefront/   # Customer-facing pages
        ├── components/       # Reusable UI components
        ├── services/         # API service functions
        ├── context/          # Auth, Cart context
        └── routes/           # Route definitions
```

---

## Features

### Pharmacist Dashboard
- **Inventory Management** — Add stock in batches, FIFO/FEFO batch allocation, expiry tracking, low-stock alerts
- **Invoices & POS** — Create invoices, record payments, invoice returns, sequential numbering (INV-000001…)
- **Orders** — View all customer orders, update delivery status, mark payments
- **Customers** — Customer accounts, ledger, balance tracking, record payments, process refunds
- **Suppliers** — Supplier accounts, stock returns, ledger
- **Reports** — Invoice report, stock report, return reports, profit/loss
- **Refund Requests** — View and process customer-submitted return requests with one-click status update
- **Analytics** — Revenue, profit charts, top products

### Customer Storefront
- **Browse & Search** — Products by category, search with suggestions
- **Cart & Checkout** — Add to cart, place COD orders
- **Order Tracking** — Real-time delivery status timeline
- **Returns & Refunds** — Submit return requests within 14-day window, track refund status
- **Account** — Profile management
- **Notifications** — Order updates

### Business Logic
- **FIFO/FEFO** batch allocation on every sale
- **14-day return policy** enforced server-side
- **Sequential numbering** — INV-000001, RET-000001, BATCH-001
- **Profit calculation** — purchase price stored at invoice time (not recalculated from live stock)
- **Customer double-entry ledger** — debit (invoiced) / credit (paid) / balance tracking

---

## Getting Started

### Prerequisites
- Node.js v18+
- PostgreSQL 14+

### Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file in `backend/`:

```env
PORT=5005
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=medsenseai_pharm
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
NODE_ENV=development
```

Run the database migrations (SQL files in `backend/migrations/`), then start:

```bash
node src/server.js
```

### Frontend Setup

```bash
cd medsense_ai
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` and proxies API calls to `http://localhost:5005`.

---

## API Overview

### Pharmacist Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/pharmacist/login` | Pharmacist login |
| POST | `/api/auth/register` | Register new pharmacist |

### Customer Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/customer/auth/login` | Customer login |
| POST | `/api/customer/auth/register` | Customer registration |

### Key Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/invoice` | List / create invoices |
| POST | `/api/invoice/returns` | Create invoice return (pharmacist) |
| POST | `/api/invoice/customer-return` | Submit return request (customer, 14-day rule) |
| GET | `/api/invoice/customer-returns` | Customer's own return history |
| PATCH | `/api/invoice/returns/:id/status` | Update return status (pharmacist) |
| GET/POST | `/api/orders` | Orders (storefront) |
| GET/POST | `/api/stock/batch` | Stock batches |
| GET/POST | `/api/customer` | Customer management |
| POST | `/api/customer/:id/payments` | Record payment or refund |

---

## Default Login

### Pharmacist Dashboard
```
Email:    admin@medsense.ai
Password: admin123
```
Access at: `http://localhost:5173/dashboard`

---

## Key Design Decisions

- **Purchase price stored at invoice creation** — profit stays accurate even if batch prices change later
- **Separate JWT secrets** for pharmacist vs customer — neither token works on the other's routes
- **FEFO then FIFO** — nearest expiry batch allocated first, then oldest batch
- **Balance formula** — `current_balance = total_debit - total_credit` (always consistent)
- **14-day return window** — enforced in backend, not just frontend

---

## Final Year Project
**University:** FAST-NUCES, Faisalabad-Chiniot Campus
**Department:** Computer Science
**Project:** MedSenseAI - AI-Powered Smart Pharmacy
