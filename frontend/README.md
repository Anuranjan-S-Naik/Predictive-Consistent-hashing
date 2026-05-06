# PAF Console — Frontend

Real-time monitoring dashboard for the **Predictive Adaptive Request Allocation Framework**.

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript** (strict mode)
- **Tailwind CSS** (dark mode, glassmorphism)
- **shadcn/ui** (Radix primitives)
- **Zustand** (state management)
- **TanStack Query** (server state)
- **Framer Motion** (animations)
- **Socket.IO** (real-time WebSocket)
- **Lucide React** (icons)
- **Sonner** (toast notifications)

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — system overview |
| `/simulation` | Start/stop/pause simulations |
| `/nodes` | Live node health monitoring |
| `/traffic` | Traffic pattern configuration |
| `/routing` | Allocation engine scores |
| `/routing/chord` | Chord DHT routing hops |
| `/routing/queues` | WFQ scheduler queues |
| `/metrics` | Real-time system metrics |
| `/forecasting` | GRU traffic predictions |
| `/benchmarks` | Algorithm comparison |
| `/experiments` | Experiment runner |
| `/alerts` | Alert center |
| `/logs` | Request log viewer |
| `/failures` | Failure injection |
| `/settings` | Configuration editor |

## Environment Variables

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
NEXT_PUBLIC_API_KEY=dev-api-key-change-me
```
