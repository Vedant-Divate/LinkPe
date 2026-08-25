# LinkPe

<div align="center">
  <img src="https://img.shields.io/badge/Status-MVP%20Live-0ea5e9?style=for-the-badge&logo=ethereum&logoColor=white" alt="Status: MVP Live" />
  <img src="https://img.shields.io/badge/Solidity-0.8.24-363636?style=for-the-badge&logo=solidity&logoColor=white" alt="Solidity" />
  <img src="https://img.shields.io/badge/Next.js-14-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/IPFS-Pinata-65C3F3?style=for-the-badge&logo=ipfs&logoColor=white" alt="IPFS" />
</div>

<p align="center">
  <strong>Trust infrastructure for digital work.</strong>
</p>

<p align="center">
  On-chain escrow · Encrypted delivery · Wallet-native settlement
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#tech-stack">Tech stack</a> ·
  <a href="#smart-contract-design">Smart contract</a> ·
  <a href="#backend-api">API</a> ·
  <a href="#local-development">Run locally</a>
</p>

---

## Overview

LinkPe is a decentralized escrow platform for freelance work. It combines on-chain settlement rules, encrypted file delivery, and a wallet-connected web application into one verifiable workflow.

<table>
  <tr>
    <td width="33%" valign="top"><strong>01 · Lock funds</strong><br />Clients fund escrow in USDC. Contract rules control custody and release.</td>
    <td width="33%" valign="top"><strong>02 · Deliver privately</strong><br />Freelancers encrypt work in the browser before storing it on IPFS.</td>
    <td width="33%" valign="top"><strong>03 · Settle clearly</strong><br />Approval, auto-release, cancellation, and dispute paths are explicit.</td>
  </tr>
</table>

### Core workflow

```text
Create link  ->  Fund escrow  ->  Submit encrypted work  ->  Review  ->  Settle
     API            USDC             IPFS + CID             Client       Contract
```

The repository contains the complete MVP path across the frontend, backend, database, storage layer, and Solidity contract.

---

## Why LinkPe

Freelance delivery becomes difficult to trust when payment, proof-of-work, and dispute handling are fragmented across separate tools.

LinkPe moves the critical trust boundary into a structured protocol layer:

| Capability | Implementation |
| --- | --- |
| Payment custody | USDC held by `LinkPeEscrow.sol` |
| Workflow control | Explicit `Pending` to `Released` / `Disputed` state transitions |
| Delivery evidence | IPFS content identifier recorded with the escrow |
| Privacy | AES-256 encryption before file upload |
| Dispute handling | Freelancer split proposals and client acceptance |
| Recovery paths | Auto-release and funded-escrow cancellation |
| Escrow discovery | Freelancer tracking by client-shared escrow ID |
| Input hardening | File, private-key, IPFS payload, and metadata validation |

The result is a small, auditable primitive for escrowed digital work rather than another all-in-one freelance marketplace.

---

## Architecture

LinkPe separates user experience, application services, off-chain storage, and on-chain settlement. The contract is authoritative for funds and state; the backend is optimized for metadata lookup and IPFS gateway access.

### Architecture diagram

This diagram shows the runtime boundaries and dependencies. It uses Mermaid defaults for reliable rendering on GitHub.

```mermaid
flowchart LR
  subgraph Users[Users]
    Freelancer[Freelancer]
    Client[Client]
  end

  subgraph Frontend[Frontend]
    WebApp[Next.js App]
    Wallet[Wagmi + RainbowKit]
    Encryption[Client-side AES-256]
    WebApp --> Wallet
    WebApp --> Encryption
  end

  subgraph Backend[Backend Services]
    API[Express API]
    Prisma[Prisma ORM]
    Proxy[IPFS Proxy]
    API --> Prisma
    API --> Proxy
  end

  subgraph Blockchain[On-chain Protocol]
    Escrow[LinkPeEscrow.sol]
    State[Escrow State]
    USDC[USDC Contract]
    Escrow --> State
    Escrow --> USDC
  end

  subgraph Storage[Off-chain Storage]
    Database[(Supabase PostgreSQL)]
    IPFS[(Pinata / IPFS)]
  end

  Freelancer --> WebApp
  Client --> WebApp
  WebApp -->|Metadata requests| API
  Wallet -->|Signed transactions| Escrow
  Prisma -->|EscrowLink records| Database
  Encryption -->|Encrypted files| IPFS
  Proxy -->|Gateway retrieval| IPFS
```

### Escrow workflow diagram

This diagram describes the application flow from metadata creation through funding, delivery, release, dispute, or cancellation.

```mermaid
flowchart TD
  Start([Escrow link created]) --> Metadata[POST /api/escrow]
  Metadata --> Shared[Link shared with client]
  Shared --> Funded[Funded\ncreateAndFundEscrow]
  Funded --> Delivery[Work prepared]
  Delivery --> Encrypted[File encrypted in browser]
  Encrypted --> Stored[File stored on IPFS]
  Stored --> Submitted[Submitted\nsubmitWork + IPFS hash]

  Submitted --> Decision{Client review}
  Decision -->|Approve| Released[Released\nreleaseFunds]
  Decision -->|No action| AutoReleased[Auto-released\nautoReleaseFunds]
  Decision -->|Reject| Disputed[Disputed\nrejectWork]

  Disputed --> Split[Split proposed\nproposeSplit]
  Split --> Accepted[Split accepted\nacceptSplit]
  Disputed --> Judgment[Default judgment\ndefaultJudgment]
  Funded --> Cancelled[Cancelled\nrequestCancel - 5% fee]

  Released --> Complete([Funds settled])
  AutoReleased --> Complete
  Accepted --> Complete
  Judgment --> Complete
  Cancelled --> Complete
```

### Runtime responsibilities

| Boundary | Responsibility | Source |
| --- | --- | --- |
| Frontend | Wallet connection, dashboard state, encryption, contract interaction | `frontend/` |
| Backend | Metadata API, validation, Prisma access, IPFS proxying | `backend/index.js` |
| Blockchain | Escrow ownership, state transitions, USDC custody, settlement | `contracts/contracts/Escrow.sol` |
| PostgreSQL | Escrow link metadata and queryable history | `backend/prisma/schema.prisma` |
| IPFS | Encrypted work artifact storage and content addressing | Pinata / IPFS |

The contract is authoritative for funds, permissions, timestamps, and settlement state. PostgreSQL stores application metadata for discovery, while encrypted files remain off-chain and are referenced by their IPFS content identifier.

## Tech Stack

| Layer | Technologies | Purpose |
| --- | --- | --- |
| Smart contracts | Solidity 0.8.24, Hardhat, OpenZeppelin | Escrow state machine, access control, USDC custody, and settlement |
| Blockchain | Ethereum Sepolia, ERC-20 USDC | Testnet execution and token-based escrow funding |
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS | Wallet-connected dashboard and escrow workflows |
| Web3 client | Wagmi, RainbowKit, Viem | Wallet connection, contract reads, and signed transactions |
| Backend | Node.js, Express.js | Metadata API, validation, health checks, and IPFS proxying |
| Persistence | Prisma ORM, PostgreSQL, Supabase | Escrow link metadata and queryable history |
| File delivery | AES-256, Pinata, IPFS | Encrypted off-chain artifact storage and retrieval |
| Deployment | Vercel, Render, Supabase | Frontend, backend, and database hosting |

### 1. Smart contract layer

Directory: `contracts/`

This layer owns the escrow lifecycle and acts as the settlement authority. It manages:

- escrow creation and funding
- submission lifecycle
- release and auto-release behavior
- dispute initiation and settlement
- cancellation logic and fee handling
- fallback judgment execution through the existing dispute timeout rules

### 2. Backend layer

Directory: `backend/`

This layer persists metadata and exposes app-facing APIs. Responsibilities include:

- escrow creation and lookup
- database persistence via Prisma
- backend health checks
- IPFS proxy access for browser-safe file retrieval
- app orchestration between frontend, database, and blockchain metadata
- request validation for wallet addresses, amounts, descriptions, and IPFS identifiers

### 3. Frontend layer

Directory: `frontend/`

This layer provides the wallet-connected user experience:

- Wagmi + RainbowKit wallet integration
- escrow dashboard and state-aware UI
- user history persistence
- encrypted file retrieval and decryption flow
- interaction with contract and backend endpoints

---

## Smart contract design

The main escrow logic lives in `contracts/contracts/Escrow.sol`.

### State machine

The contract uses an explicit settlement enum:

```solidity
enum State {
    Pending,
    Funded,
    Submitted,
    Released,
    Disputed,
    Cancelled
}
```

This state model is central to the product logic and allows each escrow to progress through deterministic lifecycle phases.

### Core behaviors

#### Funding and creation

The contract supports creating an escrow and locking funds in a contract-controlled wallet.

Key characteristics:

- escrow is bound to freelancer and client addresses
- amount is transferred to escrow contract
- state transitions are tied to contract logic rather than off-chain assumptions

#### Submission

The freelancer submits work as a reference payload, typically an IPFS hash or file metadata pointer.

This allows the app to separate:

- delivery artifact storage
- escrow settlement logic
- user-facing review UX

#### Release and auto-release

Release is triggered when the client validates the submission or the configurable timer expires.

This introduces a time-based safety mechanism that reduces waiting friction while keeping the system auditable.

#### Dispute path

When the client rejects the work, the contract enters a dispute state.

The dispute flow includes:

- settlement negotiation
- split-proposal logic via `proposeSplit`
- acceptance path via `acceptSplit`
- fallback path for time-based judgment if no resolution occurs

#### Cancellation

Cancellation is supported with a fee model to prevent abuse of the escrow flow.

This is implemented with logic around `requestCancel()` and handling of a fee, which helps preserve finality without removing user flexibility.

### Important implementation details

The project includes explicit getter methods to avoid decoder issues when reading struct values from Viem-based client code. This is a practical engineering detail and is a good example of how the app was tuned for real frontend integration.

Examples of the contract surface include:

- `createAndFundEscrow()`
- `submitWork()`
- `releaseFunds()`
- `autoReleaseFunds()`
- `rejectWork()`
- `proposeSplit()`
- `acceptSplit()`
- `requestCancel()`
- `getEscrowState()`
- `getEscrowClient()`
- `getEscrowAmount()`

---

## Backend API

The backend is a lightweight API service built on Node.js and Express. Its goal is to persist escrow metadata and expose read/write endpoints needed by the frontend.

### API overview

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | Service health and DB connectivity check |
| `/api/escrow` | POST | Create a new escrow record |
| `/api/escrow/:id` | GET | Retrieve a single escrow by ID |
| `/api/escrows/:freelancerAddress` | GET | List escrows for a freelancer |
| `/api/ipfs/:hash` | GET | Proxy IPFS content for browser-safe retrieval |

### Data model

The Prisma schema defines a persistent record for escrow metadata.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model EscrowLink {
  id                String   @id @default(uuid())
  freelancerAddress String
  amount            Int
  description       String
  status            String   @default("Pending")
  createdAt         DateTime @default(now())
}
```

This model is intentionally small and focused: it stores only the state and metadata needed for the application to render and query escrow records.

---

## File delivery and encryption flow

LinkPe uses an encrypted file delivery pipeline for work delivery.

### Flow

1. Freelancer prepares work artifact.
2. Payload is encrypted with AES-256.
3. Symmetric key is shared securely using public-key encryption.
4. Encrypted file is uploaded to IPFS via Pinata.
5. Client retrieves the IPFS content and decrypts on the frontend.
6. Downloaded file preserves original extension metadata when reconstructed.

This approach keeps the delivery content off-chain while still enabling a secure, user-friendly submission experience.

---

## Frontend

The frontend is built with Next.js and TypeScript and provides the user-facing workflow around wallet connection and escrow operations.

### Stack

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Wagmi
- RainbowKit

### Functional areas

- wallet connection and session state
- escrow list rendering
- status-aware dashboard actions
- copy-to-clipboard link generation
- loading and toast UX for contract interactions
- freelancer escrow tracking by pasted escrow ID with wallet ownership verification
- IPFS fetch/decrypt flow for submitted files
- file size, filename, private-key, and encrypted payload validation
- localStorage-based history for client-side context

---

## Repository structure

```text
LinkPe/
├── README.md
├── backend/
│   ├── .env
│   ├── index.js
│   ├── package.json
│   ├── prisma/
│   │   └── schema.prisma
│   └── skills-lock.json
├── contracts/
│   ├── artifacts/
│   ├── cache/
│   ├── contracts/
│   │   ├── Escrow.sol
│   │   └── MockERC20.sol
│   ├── scripts/
│   │   ├── check-escrow.js
│   │   ├── deploy.js
│   │   └── fastforward.js
│   ├── test/
│   │   └── escrow.js
│   ├── hardhat.config.js
│   └── package.json
├── frontend/
│   ├── app/
│   ├── lib/
│   ├── package.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── next-env.d.ts
├── .gitignore
└── .env
```

---

## Local development

### Prerequisites

- Node.js 18+
- npm or pnpm
- PostgreSQL instance or Supabase project
- Hardhat-compatible local Ethereum environment
- RPC access for Sepolia or a local chain

### Install dependencies

```bash
cd contracts && npm install
cd ../backend && npm install
cd ../frontend && npm install
```

### 1. Compile and run the contract environment

```bash
cd contracts
npx hardhat compile
npx hardhat node
```

### 2. Run the backend service

```bash
cd backend
npm run dev
```

### 3. Run the frontend app

```bash
cd frontend
npm run dev
```

Run the frontend development server and production build separately. Both commands use the `.next/` directory, so do not run `npm run build` while `npm run dev` is active. If the dev server reports missing webpack vendor chunks, stop duplicate Next.js processes, remove the generated `frontend/.next` directory, and restart `npm run dev`.

Default local ports:

- frontend: `http://localhost:3000`
- backend: `http://localhost:3001`

---

## Docker development

The repository includes containers for the frontend, backend, smart-contract tooling, and a local PostgreSQL instance.

### Start the application stack

```bash
docker compose up --build
```

This starts:

- Next.js frontend on `http://localhost:3000`
- Express backend on `http://localhost:3001`
- PostgreSQL on `localhost:5432`

The Compose backend runs `prisma db push` on startup for local development. Use migrations and a managed database workflow before using this configuration in production.

### Stop the stack

```bash
docker compose down
```

To remove the local database volume as well:

```bash
docker compose down -v
```

### Build individual images

```bash
docker build -t linkpe-backend ./backend
docker build -t linkpe-frontend ./frontend
docker build -t linkpe-contracts ./contracts
```

The frontend image uses Next.js standalone output and runs with the minimal production server.

---

## GitHub Actions CI/CD

The workflow in `.github/workflows/ci.yml` runs validation for pushes and pull requests. It publishes production container images to GitHub Container Registry only after all validation jobs pass on `main`.

| Job | Checks |
| --- | --- |
| Contracts | Install dependencies, compile Solidity, run Hardhat tests |
| Backend | Install dependencies, generate Prisma Client, check JavaScript syntax |
| Frontend | Install dependencies and create a production Next.js build |
| Publish images | Build and push backend and frontend images to GHCR |

### Published images

```text
ghcr.io/<owner>/<repository>-backend:latest
ghcr.io/<owner>/<repository>-frontend:latest
```

Each image also receives an immutable commit-SHA tag:

```text
ghcr.io/<owner>/<repository>-backend:sha-<commit>
ghcr.io/<owner>/<repository>-frontend:sha-<commit>
```

The workflow uses the repository-scoped `GITHUB_TOKEN`; no personal access token is required. In repository settings, ensure **Actions > General > Workflow permissions** allows read and write permissions, or explicitly enable package write access for the workflow.

To publish manually, use **Actions > CI/CD > Run workflow** on the `main` branch.

---

## Environment variables

### Backend

```env
DATABASE_URL=postgresql://username:password@host:5432/database
PORT=3001
```

### Frontend

```env
NEXT_PUBLIC_API_URL=https://your-backend-url
NEXT_PUBLIC_ESCROW_ADDRESS=0xYourEscrowContractAddress
NEXT_PUBLIC_USDC_ADDRESS=0xYourUSDCContractAddress
```

### Smart contract / deployment

Typical deployment configuration includes:

- RPC URL
- private key
- network chain config
- deployed USDC address
- environment-specific metadata for Sepolia or a local Hardhat node

---

## Deployment notes

The project is designed around a production-style deployment topology:

- backend hosted on Render
- frontend hosted on Vercel
- database hosted on Supabase PostgreSQL
- contracts deployed to Ethereum Sepolia
- assets stored in Pinata + IPFS

This makes the repo a credible MVP with a strong foundation for a production launch.

---

## Security considerations

The current implementation includes practical safeguards but still benefits from more production-hardening.

### Current security patterns

- contract-based escrow enforcement
- authorization checks inside contract logic
- OpenZeppelin `ReentrancyGuard` integration
- time-based release logic
- encrypted file transfer for submission artifacts
- wallet-based identity and settlement provenance

### Planned improvements

- stronger wallet-signing and public-key verification
- enhanced arbitration and dispute-review flow
- broader test coverage for edge cases
- more explicit security review around contract update paths

---

## Roadmap

### Current status

The initial near-term MVP scope is implemented: dispute outcomes include the contract fallback path, the dashboard supports escrow tracking by ID, encrypted file handling is validated, and escrow links provide a wallet connection path for clients.

### Mid term

- milestone-based escrow transitions
- ERC-4337 gasless onboarding
- stronger arbitration workflow integration
- increased automation for deployments and validation

### Long term

- scalable freelance work coordination platform
- broader trust infrastructure for digital work delivery
- multi-stage settlement and reputation-aware contract flows

---

## Contributing

Contributions are welcome in the following areas:

- smart contract audit and optimization
- backend API robustness and validation
- frontend UX and state management
- encryption and IPFS reliability
- deployment automation and environment config

When making changes, keep the boundaries clear:

- contract logic stays in the Solidity layer
- persistence and API logic stays in the backend layer
- experience and interaction logic stays in the frontend layer

---

## License

This project is governed by the repository license currently in effect. Review the project license before commercial reuse or public distribution.

---

<p align="center">
  <i>Escrow logic, delivery verification, and trust infrastructure for digital work.</i>
</p>
