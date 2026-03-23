# Personal Dev Tools

A collection of personal development tools running locally. Operates as a single Python server — no build process needed, just use in your browser.

## Features

| Tool | Description |
|------|-------------|
| Mock Server | REST API mock registration & proxy, traffic logs |
| CSV Editor | CSV editing, encoding conversion, duplicate analysis, row/column management |
| Markdown | Editor + live preview, AI proofreading, popup viewer, save/version management |
| JSON Formatter | JSON sorting, formatting, tree view |
| Translate | OpenAI-based multilingual translation |
| MyBatis | MyBatis XML ↔ query conversion |
| Character Count | Byte/character/word count, bytes per encoding |
| Diff Compare | Text comparison (inline/side-by-side) |
| PDF Convert | PDF → XLSX, PPTX conversion |
| Parameter Convert | URL parameter ↔ JSON conversion |
| Git Manager | Local Git repository status, commit, branch management |
| Data AI | AI-based mock data generation (CSV/JSON/TSV), DB storage |
| Developer Mode | Tool name customization, DB explorer, tab management, module settings, CDN library management |

## Getting Started

### 1. Install Python

- Install Python 3.10 or higher from [python.org/downloads](https://www.python.org/downloads/).
- **Windows**: Make sure to check **"Add Python to PATH"** during installation.
- **macOS**: Download and run the installer.

### 2. Run

#### Quick Start

Use the launcher files included in the project folder.

**Windows**
- Double-click `start.bat`.

**macOS**
- Open Terminal and run:
```bash
cd /path/to/project
./start.sh
```
- Or drag `start.sh` into Terminal and press Enter.

The browser will open automatically.

**Stop the server**: Press `Ctrl+C` in the terminal, or close the window.

#### Manual Setup (for developers)

```bash
# Create virtual environment
python3 -m venv .venv

# Activate virtual environment
source .venv/bin/activate        # macOS / Linux
.venv\Scripts\activate           # Windows

# Set environment variables (for AI features)
cp .env.example .env             # macOS / Linux
copy .env.example .env           # Windows
# Enter your OPENAI_API_KEY in the .env file

# Start the server
python3 server.py                # macOS / Linux
python server.py                 # Windows
```

Open `http://127.0.0.1:8080` in your browser.

```bash
# Options
python3 server.py --port 9090        # Change port
python3 server.py --no-open          # Disable auto browser open
```

### 3. AI Features Setup (Optional)

An OpenAI API Key is required for translation, proofreading, and Data AI features.
You can skip this step if you don't need AI features.

1. Sign up and get an API Key at [OpenAI API Keys](https://platform.openai.com/api-keys).
2. Copy `.env.example` to `.env` in the project folder.
3. Open `.env` with a text editor and replace `sk-your-api-key-here` with your key.

### Offline Usage

Pre-download external libraries to use without internet.

1. Go to Developer Mode (DEV) tab → CDN Management
2. Click **Download Current Version** or **Download Latest Version**
3. Files are saved to `static/vendor/` and will work offline

> AI features (translate, proofreading, Data AI) require OpenAI API connection and cannot be used offline.

## Package Dependencies

The following packages are auto-installed on first server run:

| Package | Purpose | Required |
|---------|---------|----------|
| `openai` | AI translation, proofreading, Data AI | When using AI features |
| `cryptography` | Developer mode encryption | When using developer mode |
| `openpyxl` | PDF → XLSX conversion | When using PDF conversion |
| `python-pptx` | PDF → PPTX conversion | When using PDF conversion |

> If auto-install fails, install manually: `pip install openai cryptography openpyxl python-pptx`

## Project Structure

```
├── server.py           # Python server (full backend)
├── start.sh            # macOS/Linux quick launcher
├── start.bat           # Windows quick launcher
├── .env.example        # Environment variable example
├── static/
│   ├── index.html      # Main page
│   ├── styles.css      # Styles
│   ├── app.js          # Common logic
│   ├── *.js            # Per-tool client scripts
│   └── vendor/         # CDN library local cache (gitignore)
├── logs/               # Server logs (gitignore)
└── .env                # Environment variables (gitignore)
```

## Logs

Server logs are auto-generated in the `logs/` folder.

- `server.log` — Full log (10MB rotation, 5 backups)
- `error.log` — Errors only

## License

[MIT License](LICENSE)
