# 🎬 Arc-Watch-Worthy

> **Pay only for content that proves worthy.** Web3 video streaming with granular nanopayments on Arc Testnet.

[![Deployed on Vercel](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)](https://arc-watch-worthy.vercel.app)
[![Backend on Render](https://img.shields.io/badge/Render-Backend-purple?logo=render)](https://arcstream-backend.onrender.com)
[![Circle Payments](https://img.shields.io/badge/Circle-Nanopayments-blue?logo=circle)](https://circle.com)

## ✨ Why Arc-Watch-Worthy?

Traditional platforms force you to pay upfront for content you might regret. Subscriptions auto-renew for things you barely watch. Pay-per-view charges full price even if you quit after 30 seconds.

**Arc-Watch-Worthy flips the script:**
- 🆓 **First chunk is always free** - Try before you commit
- ⚡ **Pay as you watch** - Unlock content in 5-second to 60-minute chunks
- 🔓 **Never pay twice** - Purchased chunks stay unlocked forever
- 🛡️ **Gasless transactions** - Circle SCA wallets handle everything
- 🎨 **Quality earns more** - Creators succeed when content is truly watch-worthy

## 🎥 How It Works

### For Viewers
1. Connect your MetaMask wallet
2. Get a gasless Circle Smart Contract Account (SCA)
3. Watch the first chunk free
4. Pay only for chunks you choose to unlock
5. Enable auto-pay for seamless viewing

### For Creators
1. Upload your video (up to 5GB)
2. Set chunk duration (5 seconds to 60 minutes)
3. Set price per chunk (≤ $0.01 USDC)
4. Earn as viewers unlock your content
5. Quality content earns more - the market decides what's worthy

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16, TypeScript, TailwindCSS |
| **Backend** | Express, Node.js, Prisma ORM |
| **Database** | PostgreSQL (Neon) |
| **Storage** | Vercel Blob (up to 5GB files) |
| **Payments** | Circle Developer-Controlled Wallets + x402 Protocol |
| **Blockchain** | Arc Testnet (Chain ID: 5042002) |
| **Auth** | SIWE (Sign-In with Ethereum) |
| **Deployment** | Vercel (Frontend), Render (Backend) |

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL database
- Circle API credentials
- MetaMask wallet

### Environment Variables

**Backend (.env)**
```env
DATABASE_URL=postgresql://...
CIRCLE_API_KEY=your_circle_api_key
CIRCLE_ENTITY_SECRET=your_circle_entity_secret
ARC_RPC_URL=https://rpc.testnet.arc.network
USDC_CONTRACT_ADDRESS=0x3600000000000000000000000000000000000000
X402_FACILITATOR_URL=https://facilitator.x402.org
FRONTEND_URL=http://localhost:3000
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
```

**Frontend (.env.local)**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.network
NEXT_PUBLIC_USDC_CONTRACT=0x3600000000000000000000000000000000000000
```

### Installation

```bash
# Clone the repository
git clone https://github.com/intellygentle/arc-watch-worthy.git
cd arc-watch-worthy

# Install backend dependencies
cd backend
npm install
npx prisma generate
npx prisma db push

# Install frontend dependencies
cd ../frontend
npm install

# Run development servers
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/nonce` | Get SIWE nonce |
| POST | `/api/auth/link` | Link wallet & create SCA |
| GET | `/api/videos` | List all videos |
| POST | `/api/videos` | Upload video |
| GET | `/api/videos/:id` | Get video metadata |
| GET | `/api/videos/:id/stream` | Stream video |
| POST | `/api/videos/:id/stream/:chunk` | Unlock chunk (x402) |
| GET | `/api/videos/:id/paid-chunks` | Get user's paid chunks |
| GET | `/api/wallets/:address/state` | Get wallet deployment status |
| POST | `/api/wallets/deploy` | Deploy SCA wallet |

## 🎨 UI Design

Arc-Watch-Worthy features a **Retro-Futuristic / Tech-Nostalgia** aesthetic:
- **Deep Space background** (#1F1A31) with subtle grid
- **Glassmorphism cards** with backdrop blur
- **Gradient accents** from Jelly Purple (#8656EF) to Arc Teal (#00C8B3)
- **Circular progress indicators** nodding to the Circle brand
- **Smooth micro-interactions** for payment success states

## 🔒 Security

- All payments processed on-chain via Circle SCA wallets
- x402 protocol ensures atomic payment-for-content swaps
- SIWE authentication for wallet verification
- Row-level security ready for multi-tenant data

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Circle](https://circle.com) for Developer-Controlled Wallets
- [Arc Network](https://arc.network) for the testnet infrastructure
- [x402 Protocol](https://x402.org) for nanopayment standards
- [Vercel](https://vercel.com) and [Render](https://render.com) for hosting

---

**Built with ❤️ for the LABLAB.AI hackathon. Pay only for what's worthy.**
🚀