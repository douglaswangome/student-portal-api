# Student Portal API

A unified monorepo for a student management system built on **Microsoft Dynamics 365 Business Central**, with a **Go backend** and a **React/TypeScript frontend**. The system provides a modern web interface for registering, searching, and managing student records that are persisted directly in Business Central.

---

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STUDENT PORTAL ECOSYSTEM                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐     SOAP/HTTP      ┌──────────────┐    REST/JSON    ┌──────────────┐
│   │  Business    │ ◄─────────────────► │    Go API    │ ◄─────────────► │   React      │
│   │  Central     │   AL Codeunit       │   (Chi)      │   TanStack      │   Frontend   │
│   │  (AL Ext)    │   DWStudentService  │              │   Query +       │   (Vite)     │
│   │              │                     │              │   Router        │              │
│   └──────────────┘                     └──────────────┘                 └──────────────┘
│         │                                       │                                 │
│         │  • Customer table (Student)           │  • Auth proxy (BC basic auth)   │  • Type-safe API client
│         │  • ACA-Academics Central Setups       │  • Request validation           │  • Optimistic UI updates
│         │  • Permission Set (90100)             │  • Health/readiness endpoints   │  • Accessible forms (Mantine)
│         │  • JSON envelope protocol             │  • CORS for React origin        │  • Motion (GSAP)
│         └───────────────────────────────────────┴─────────────────────────────────┘
│
└─────────────────────────────────────────────────────────────────────────────┘
```

### Three Layers, One Source of Truth

| Layer | Role | Technology | Key Responsibility |
|-------|------|------------|-------------------|
| **AL Extension** | **Domain Core** | AL (Business Central) | Data model, business rules, validation, sequential numbering, lookups |
| **Go Backend** | **Integration & Gateway** | Go 1.27, Chi, SOAP client | Auth proxy, request shaping, HTTP semantics, health checks |
| **React Frontend** | **User Experience** | React 19, TanStack Query/Router, Mantine, GSAP | Type-safe consumption, optimistic updates, accessible forms, motion |

---

## 📦 Tech Stack

### Business Central Extension (`al/`)
- **Language**: AL (Microsoft Dynamics 365 Business Central)
- **Objects**: Codeunit `90100` (`DW Student Service`), Permission Set `90100`
- **Dependencies**: Base Application, `ACA-Academics Central Setups` (for nationality/county lookups)
- **Protocol**: SOAP web service returning JSON envelopes (`{ok, data}` / `{ok:false, error:{code,message,fields}}`)

### Go Backend (`cmd/`, `internal/`)
| Package | Purpose |
|---------|---------|
| `cmd/api` | Entry point, router, middleware, graceful shutdown |
| `internal/config` | Environment-based configuration (12-factor) |
| `internal/bc` | SOAP client → Business Central Codeunit |
| `internal/httpx` | Standardised JSON responses & error shape |
| `internal/students` | HTTP handlers, input validation, BC error mapping |

**Key Libraries**: `go-chi/chi/v5`, `go-chi/cors`, `joho/godotenv`, `slog` (structured logging)

### React Frontend (`web/`)
| Category | Libraries |
|----------|-----------|
| **Core** | React 19, TypeScript, Vite |
| **Routing & State** | TanStack Router (type-safe), TanStack Query (server state) |
| **UI** | Mantine v9 (components, forms, dates, notifications), Phosphor Icons |
| **Data & Motion** | Axios, Day.js, GSAP (animations), TanStack Table |
| **Quality** | Oxlint, TypeScript strict, @tanstack/eslint-plugin-query |

---

## 🔧 Business Central Extension — Static Analysis

> **Note**: The `al/` folder is provided for **code review and deployment reference**. It does not require local symbol compilation, `AL: Go!`, or a Docker container to understand the domain. Treat it as readable reference code.

### Permission Set: `DW Student API` (ID 90100)
```al
permissionset 90100 "DW Student API"
{
    Assignable = true;
    Permissions =
      codeunit "DW Student Service" = X,           // Execute
      tabledata Customer = RIM,                    // Read/Insert/Modify
      tabledata "ACA-Academics Central Setups" = R; // Read-only lookups
}
```

### Codeunit: `DW Student Service` (ID 90100)

| Procedure | Purpose | Parameters | Returns |
|-----------|---------|------------|---------|
| `Ping()` | Health check | — | `"Pong from BC"` |
| `ListStudents(search, skip, top)` | Paginated, searchable list | `search: Text`, `skip: Integer`, `top: Integer` (1–100) | JSON envelope: `{total, skip, top, items: Student[]}` |
| `GetStudent(studentNo)` | Single record by PK | `studentNo: Text` | Student JSON or `NOT_FOUND` |
| `RegisterStudent(payload)` | Create new student | `payload: Text (JSON)` | Created student with generated `studentNo` |
| `UpdateStudent(studentNo, payload)` | Optimistic update with version | `studentNo`, `payload: Text (JSON)` + `version` | Updated student or `CONFLICT` |
| `GetLookups()` | Dropdown data | — | `{nationalities: [{code,name}], counties: [...]}` |

#### Domain Rules (Enforced in AL — Single Source of Truth)
- **Student identification**: `Customer` records with `Customer Type = Student` and `Blocked = ` (space = not blocked)
- **Sequential numbering**: `PRT-000001`, `PRT-000002`… via `LockTable()` to prevent duplicates under concurrency
- **Validation**: Required fields (first/last name, gender, DOB ≥ 13 years, ID number unique, phone format, email format), nationality/county codes must exist in `ACA-Academics Central Setups`
- **Optimistic locking**: `version = SystemModifiedAt` (format `0,9`) must match on update
- **Search**: Case-insensitive across student no, name, ID no, email, phone, university email; minimum 2 characters

---

## 🚀 Go Backend — API Contract

**Base URL**: `http://localhost:8081/api/v1` (configurable via `PORT`)

### Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/healthz` | Liveness probe | — |
| `GET` | `/readyz` | Readiness (BC reachable) | — |
| `GET` | `/lookups` | Nationality & county dropdown data | — |
| `GET` | `/students` | List students (paginated, searchable) | — |
| `POST` | `/students` | Register new student | — |
| `GET` | `/students/{studentNo}` | Get single student | — |
| `PATCH` | `/students/{studentNo}` | Update student (optimistic, version required) | — |

### Query Parameters (List)
| Param | Default | Range | Description |
|-------|---------|-------|-------------|
| `search` | `""` | ≥2 chars | Case-insensitive multi-field search |
| `page` | `1` | ≥1 | Page number |
| `pageSize` | `25` | 1–100 | Items per page |

### Request / Response Shapes

**Create Student** (`POST /students`)
```json
{
  "firstName": "John",
  "middleName": "William",
  "lastName": "Doe",
  "gender": "Male",
  "dateOfBirth": "2005-03-15",
  "idNumber": "12345678",
  "nationality": "KEN",
  "county": "NRB",
  "phone": "0712345678",
  "alternatePhone": "+254712345678",
  "email": "john.doe@example.com",
  "postalAddress": "P.O. Box 123, Nairobi"
}
```

**Update Student** (`PATCH /students/{studentNo}`)
```json
{
  "firstName": "Jonathan",
  "version": "2024-01-15 14:30:45.123"
}
```

**Success Envelope** (all endpoints)
```json
{
  "ok": true,
  "data": { ... }
}
```

**Error Envelope**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR|NOT_FOUND|CONFLICT|BAD_REQUEST|UPSTREAM_ERROR",
    "message": "Human-readable description",
    "fields": { "fieldName": "Specific message" },
    "requestId": "req_abc123"
  }
}
```

---

## 💻 React Frontend — Features

### Pages
- **`/` — Students List**: Searchable, paginated table (desktop) / card stack (mobile); keyboard navigation (`/` focuses search, `Enter` opens row); staggered row entrance animation
- **`/students/:studentNo` — Student Detail**: ID card with animated seal on registration; editable sections; brass highlight on changed fields after save; browser back restores list state

### Components
| Component | Highlights |
|-----------|------------|
| `StudentFormDrawer` | Right-slide drawer, focus trap, restores focus on close, `@mantine/form` controlled validation |
| `StudentForm` | Field-level validation mirrors BC rules; only changed fields sent on edit; conflict detection with reload action |
| `IdCard` | GSAP seal animation (reduced-motion aware), 3D tilt on hover, copy-to-clipboard |
| `AnimatedNumber` | Rolling count for totals (respects `prefers-reduced-motion`) |
| `RootLayout` | App shell with theme toggle (persisted), page-transition fade |

### Developer Experience
- **Type-safe API**: `ApiError` class with status, code, fields, requestId
- **TanStack Query**: 5-min stale time, no refetch on focus, retry only on 5xx
- **TanStack Router**: Search params validated & typed (`StudentsSearch`)
- **Mantine Theme**: Custom CSS variables for light/dark, brass accent, semantic colours

---

## ⚙️ Setup & Installation

### Prerequisites
- **Go** 1.27+ (for backend)
- **Node.js** 20+ & **npm** (for frontend)
- **Business Central** environment (On-prem or SaaS) with the AL extension published
  - The `al/` folder is **reference only** — deploy via `alc`/`AL: Go!` in VS Code or your CI/CD pipeline

### 1. Configure Environment
Create `.env` in the repo root (or export in your shell):
```bash
# Required
BC_BASE_URL=https://your-bc-instance.api.businesscentral.dynamics.com
BC_USER=your-api-user@domain.com
BC_PASSWORD=your-web-service-access-key

# Optional (defaults shown)
PORT=8081
ALLOWED_ORIGIN=http://localhost:5173
BC_INSTANCE=BC200
BC_COMPANY=TEST
BC_SERVICE=DWStudentService
```

### 2. Run the Go API
```bash
cd C:\Users\doug\Documents\student-portal-api
go mod tidy
go run ./cmd/api
# → Server starting on :8081
# → Health:   GET http://localhost:8081/healthz
# → Ready:    GET http://localhost:8081/readyz
```

### 3. Run the React Frontend
```bash
cd web
npm install
npm run dev
# → VITE_API_URL defaults to http://localhost:8081
# → Open http://localhost:5173
```

### 4. Verify End-to-End
1. Open the frontend — student list loads from BC
2. Click **Register student** → fill form → submit
3. New student appears in list with animated count
4. Click a row → detail page opens with ID card animation
5. Click **Edit** → change a field → save → brass highlight shows changed field

---

## 🔐 Security Notes

- **No secrets in code**: BC credentials via environment variables only
- **Basic Auth** over HTTPS to Business Central (SOAP endpoint)
- **CORS** locked to `ALLOWED_ORIGIN` (React dev server by default)
- **Request validation** at both Go and AL layers (defence in depth)
- **Rate limiting / WAF**: Recommended at reverse proxy (nginx, Traefik, Azure Front Door)

---

## 📁 Repository Structure

```
student-portal-api/
├── al/                              # Business Central AL Extension (reference)
│   ├── DWStudentApi.PermissionSet.al
│   └── DWStudentService.Codeunit.al
├── cmd/
│   └── api/
│       └── main.go                  # Entry point, router, middleware
├── internal/
│   ├── config/                      # 12-factor config from env
│   ├── bc/                          # SOAP client → BC Codeunit
│   ├── httpx/                       # Standard JSON responses
│   └── students/                    # HTTP handlers + validation
├── web/                             # React Frontend (Vite + TS)
│   ├── src/
│   │   ├── api/client.ts            # Axios + ApiError
│   │   ├── components/              # RootLayout, IdCard, AnimatedNumber
│   │   ├── domains/student/         # Feature-sliced: api, pages, components
│   │   ├── lib/                     # format, constants, motion (GSAP)
│   │   ├── router.tsx               # TanStack Router + search validation
│   │   ├── theme.ts                 # Mantine theme + CSS variables
│   │   └── index.css                # Global styles (light/dark, motion)
│   ├── package.json
│   └── vite.config.ts
├── go.mod
├── go.sum
└── README.md                        # ← You are here
```

---

## 🛠 Development Workflow

| Task | Command |
|------|---------|
| **Backend: run** | `go run ./cmd/api` |
| **Backend: build** | `go build -o bin/api ./cmd/api` |
| **Backend: test** | `go test ./...` |
| **Frontend: dev** | `cd web && npm run dev` |
| **Frontend: build** | `cd web && npm run build` |
| **Frontend: lint** | `cd web && npm run lint` |
| **Frontend: preview** | `cd web && npm run preview` |

---

## 📝 Deployment Notes

### Business Central Extension
1. Open `al/` in VS Code with **AL Language Extension**
2. `AL: Publish` to your target environment
3. Assign **Permission Set `DW Student API`** to the API user
4. Verify web service is exposed: `.../WS/<instance>/<company>/Codeunit/DWStudentService`

### Go API
- Containerise with multi-stage Dockerfile (scratch/distroless)
- Run behind TLS-terminating reverse proxy
- Health checks: `/healthz` (liveness), `/readyz` (readiness + BC connectivity)

### React Frontend
- `npm run build` → static assets in `web/dist/`
- Serve via CDN / static hosting (Netlify, Vercel, Azure Static Web Apps, nginx)
- Set `VITE_API_URL` at build time to production API origin

---

## 🤝 Contributing

1. Fork → feature branch → PR
2. Backend: `go fmt`, `go vet`, `go test ./...`
3. Frontend: `npm run lint`, `npm run build` (type-checks via `tsc -b`)
4. Follow conventional commits (`feat:`, `fix:`, `chore:`)

---

## 📄 License

Proprietary — internal use only.

---

## 🙋 Support

For questions about the Business Central integration, contact the **Dynamics 365 team**.
For API/frontend issues, open a GitHub issue in this repository.

---

*Generated from static analysis of the monorepo — no build or symbol download required.*