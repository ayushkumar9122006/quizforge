# QuizForge — Deployment Guide

## Option A — Render.com (Recommended, Free Tier)

### Step 1: Push to GitHub
```bash
cd quizforge
git init
git add .
git commit -m "Initial QuizForge commit"
# Create repo on github.com then:
git remote add origin https://github.com/YOUR_USERNAME/quizforge.git
git push -u origin main
```

### Step 2: Deploy Backend on Render
1. Go to https://render.com → New → Web Service
2. Connect GitHub → select `quizforge`
3. Fill in:
   - **Root Directory:** `backend`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables:
   - `OPENROUTER_API_KEY` → your key
   - `SECRET_KEY` → run `python -c "import secrets; print(secrets.token_hex(32))"`
   - `OPENROUTER_MODEL` → `meta-llama/llama-3.1-8b-instruct:free`
5. Add a **PostgreSQL** database from Render dashboard
   - Copy the Internal Connection String into `DATABASE_URL`
6. Deploy → note your backend URL: `https://quizforge-api.onrender.com`

### Step 3: Deploy Frontend on Render
1. Render → New → Static Site
2. Same repo, **Root Directory:** `frontend`
3. **Build Command:** `npm install && npm run build`
4. **Publish Directory:** `dist`
5. Environment variable: `VITE_BACKEND_URL` → `https://quizforge-api.onrender.com`
6. Deploy → get URL: `https://quizforge-frontend.onrender.com`

### Step 4: Update CORS
Go back to backend service → add env var:
- `FRONTEND_URL` → `https://quizforge-frontend.onrender.com`

### Step 5: Seed demo data
In Render backend → Shell tab:
```bash
python seed.py
```

---

## Option B — Railway (Backend) + Vercel (Frontend)

### Backend on Railway
1. https://railway.app → New Project → Deploy from GitHub
2. Select `quizforge` repo → set root to `backend`
3. Add PostgreSQL plugin from Railway dashboard
4. Set environment variables (same as Render above)
5. Set start command: `alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Note URL: `https://quizforge-api.up.railway.app`

### Frontend on Vercel
1. https://vercel.com → New Project → Import `quizforge`
2. **Root Directory:** `frontend`
3. **Framework:** Vite
4. Environment variable: `VITE_BACKEND_URL` → Railway backend URL
5. Deploy → get URL: `https://quizforge.vercel.app`

---

## Option C — Docker (Self-hosted VPS)

### Prerequisites
- Ubuntu 22.04 VPS (DigitalOcean, Hetzner, etc.) — ~$6/month
- Docker + Docker Compose installed

```bash
# Install Docker on Ubuntu
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### Deploy
```bash
# Clone repo on VPS
git clone https://github.com/YOUR_USERNAME/quizforge.git
cd quizforge

# Copy and fill env
cp .env.example .env
nano .env   # set OPENROUTER_API_KEY and SECRET_KEY

# Start all services
docker compose up -d --build

# Seed demo data (first time only)
docker compose --profile seed up seed

# Check logs
docker compose logs -f backend
```

### Access
- Frontend: `http://YOUR_VPS_IP`
- Backend API: `http://YOUR_VPS_IP:8000`
- API docs: `http://YOUR_VPS_IP:8000/docs`

### Add SSL with Certbot (optional)
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

---

## WebSocket Note for Production

WebSockets need the proxy to support upgrade headers.

**Render/Railway:** Supported natively — no config needed.

**Nginx (self-hosted):** Add to your nginx config:
```nginx
location /ws/ {
    proxy_pass         http://localhost:8000;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection "upgrade";
    proxy_set_header   Host $host;
    proxy_read_timeout 86400;
}
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL async URL |
| `SECRET_KEY` | ✅ | JWT signing key (min 32 chars) |
| `OPENROUTER_API_KEY` | ✅ | From openrouter.ai |
| `FRONTEND_URL` | ✅ | For CORS whitelist |
| `VITE_BACKEND_URL` | ✅ | Frontend → backend URL |
| `OPENROUTER_MODEL` | ❌ | Default: llama-3.1-8b-instruct:free |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | ❌ | Default: 30 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | ❌ | Default: 7 |
