# ⚒️ Forge AI | Professional Crypto Trading Terminal

**Forge AI** is a high-performance, institutional-grade trading dashboard designed for professional futures traders. Powered by AI and wrapped in a bold **Neo-Brutalism** aesthetic, Forge provides a centralized cockpit for managing multiple exchanges and automated technical analysis.

![Forge AI Terminal Preview](https://i.ibb.co.com/pg00Pvc/image.png)

## ✨ Features

- **🌐 Multi-Exchange Support:** Seamlessly connect and trade on both **Bybit** and **Binance** (USDT-M Futures).
- **🧠 Intelligence Scanner:** Real-time market scanning for high-volume pairs using AI (OpenRouter or Groq).
- **⚖️ Precise Risk Management:** Automated PNL and ROI estimations for every Take Profit and Stop Loss target.
- **⚡ Quick Execution:** One-click deployment of trading strategies with manual override capabilities.
- **🛡️ Privacy First:** **Zero data storage on servers.** All API keys and preferences are stored 100% locally in your browser.
- **📦 Batch Actions:** Instant "Close All", "Close Win", or "Close Loss" for rapid portfolio-wide risk control.
- **🎨 Neo-Brutalist UI:** A rigid, high-contrast 3D interface designed for clarity and visual authority.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (Version 18.x or higher)
- NPM or Yarn
- API Keys from Bybit/Binance and OpenRouter/Groq

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/cikgupapazola/forge-ai-terminal.git
   cd forge-ai-terminal
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run in development mode:**
   ```bash
   npm run dev
   ```
   Access the dashboard at `http://localhost:3000`.

## 🏗️ Production Deployment

To build the optimized production bundle:

```bash
npm run build
```

### Self-Hosting (Standalone Mode)

Forge AI is optimized for low-resource hosting (e.g., on a local laptop or VPS):

1. Follow the `standalone` build instructions to generate a minimal footprint.
2. Run with Node.js:
   ```bash
   PORT=55000 node .next/standalone/server.js
   ```

## 🔐 Security Disclosure

Forge AI is a client-side interface. Your API keys are **never** transmitted to any server other than the official Exchange endpoints via the encrypted API Routes. For maximum security, always use Cloudflare Access or similar Zero Trust solutions when exposing your local server to the internet.

## 🤝 Contribution & Support

Found a bug or have a feature request? Please open an issue or contact our engineering team:
- **Email:** official@forgeai.eu.org
- **Developer:** [cryptsmile](https://github.com/cikgupapazola)

---
*Disclaimer: Trading crypto futures involves high risk. Forge AI is a tool for professional advisors and should be used responsibly. Always test with small margins first.*
