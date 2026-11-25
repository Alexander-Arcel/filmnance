# Filmnance

A film financing and lending platform for filmmakers. It handles loan applications,
KYC-based trust scoring, admin verification, disbursement, repayment tracking, and
delay/grace-period rules, with separate admin and producer dashboards.

## Features

- Trust scoring (identity, behavior, financial pillars) with Bronze/Silver/Gold tiers
  that determine loan eligibility and interest rates
- Loan lifecycle: application → admin approval → disbursement → repayment → completion/default
- Delay and monthly-update rule engine with grace periods, warning windows, and
  automated penalty escalation
- Authentication: JWT, bcrypt transaction PIN with lockout, rate limiting, GeoIP-based
  login freezing with email recovery links
- Admin tools: verification queue, loan management, treasury, audit logs, notifications
- File uploads for KYC IDs, scripts, trailers, and delay proof

## Tech Stack

- Backend: FastAPI, SQLAlchemy 2.0, PostgreSQL, Pydantic v2, Alembic
- Security: python-jose (JWT), passlib/bcrypt, SlowAPI
- Background jobs: APScheduler
- Frontend: HTML, CSS, vanilla JavaScript (no build step)
- Other: SMTP email for OTP and alerts, Decimal arithmetic for money values

## Project Structure

```
backend/
  main.py              App entry point, routers, static file serving
  core/                Config, database, security, scheduler
  models/              SQLAlchemy models and Pydantic schemas
  api/v1/              Auth, loan, transaction, admin, upload endpoints
  services/            Trust, loan, payment, delay engine, audit logic
  alembic/             Database migrations
  static/              HTML/CSS/JS for admin and user dashboards
```

## Prerequisites

- Python 3.10+
- PostgreSQL
- Gmail account with an app password (for email features)

## Setup

1. Clone the repository and enter the project folder.
2. Create and activate a virtual environment:

   ```
   python -m venv venv
   venv\Scripts\activate          # Windows
   source venv/bin/activate       # macOS/Linux
   ```

3. Install dependencies:

   ```
   pip install -r requirements.txt
   ```

4. Create a PostgreSQL database named `fastapi_db`.

5. Create a `.env` file in the project root:

   ```
   DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/fastapi_db
   SECRET_KEY=<generate a random secret>
   EMAIL_USER=<your Gmail address>
   EMAIL_PASS=<your Gmail app password>
   APP_URL=http://localhost:8000
   ADMIN_DISPLAY_EMAIL=admin@filmnance.com
   ```

6. Run migrations (from the `backend/` folder):

   ```
   cd backend
   alembic upgrade head
   ```

7. Optional: seed demo data (from the project root):

   ```
   python -m backend.scripts.seed
   ```

8. Start the server (from the project root):

   ```
   uvicorn backend.main:app --reload
   ```

## API and Pages

- Base path: `/api/v1`
- Interactive docs: http://localhost:8000/docs
- Routers: auth, loan, transactions, admin, uploads
- Pages: `/` (landing), `/admin-dashboard`, `/user-dashboard`

## Notes

- `.env` is gitignored — never commit real credentials.
- Local and loopback IPs are exempt from the GeoIP login-freeze check.
