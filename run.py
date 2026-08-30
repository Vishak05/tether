'''
Tether Agent — Development Server Launcher

Run this script to start the agent in hot-reload mode for development:

    C:\\Python314\\python.exe run.py

Or point uvicorn at it directly:

    C:\\Python314\\python.exe -m uvicorn agent.main:app --host 0.0.0.0 --port 8765 --reload

NOTE: Dependencies are installed into the Python 3.14 user site-packages
(C:\\Users\\acer\\AppData\\Roaming\\Python\\Python314\\site-packages).
Always invoke with C:\Python314\python.exe to pick them up correctly.

Environment variables (all optional, override defaults):
    TETHER_HOST      — bind address (default: 0.0.0.0)
    TETHER_PORT      — port (default: 8765)
    TETHER_LOG_LEVEL — log level (default: INFO)
'''
import uvicorn
from agent.core.config import HOST, PORT, LOG_LEVEL

if __name__ == "__main__":
    print(f"""
╔══════════════════════════════════════════╗
║         Tether Agent — Phase 1          ║
║  http://{HOST}:{PORT}                      ║
║  Docs: http://127.0.0.1:{PORT}/docs       ║
╚══════════════════════════════════════════╝
""")
    uvicorn.run(
        "agent.main:app",
        host=HOST,
        port=PORT,
        reload=True,
        reload_dirs=["agent"],
        log_level=LOG_LEVEL.lower(),
    )
