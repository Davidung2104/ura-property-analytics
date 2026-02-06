# Complete Setup Guide: URA Property Analytics Platform
## From Zero to Public Website (Beginner Friendly)

---

## 📋 Overview

You'll be setting up:
1. **Backend** (Node.js server) → Hosts your API, connects to URA
2. **Frontend** (React website) → The charts and UI users see

```
Users → Frontend (Vercel) → Backend (Railway) → URA API
```

---

## 🛠️ PART 1: Install Prerequisites (One-time Setup)

### Step 1.1: Install Node.js

Node.js is required to run JavaScript on your computer.

1. Go to: https://nodejs.org/
2. Download the **LTS version** (recommended)
3. Run the installer, click "Next" through everything
4. Verify installation - open Terminal (Mac) or Command Prompt (Windows):

```bash
node --version
# Should show something like: v20.10.0

npm --version
# Should show something like: 10.2.0
```

### Step 1.2: Install Git

Git helps you manage and deploy code.

1. Go to: https://git-scm.com/downloads
2. Download and install for your OS
3. Verify:

```bash
git --version
# Should show something like: git version 2.42.0
```

### Step 1.3: Install VS Code (Recommended)

A code editor to view and edit files.

1. Go to: https://code.visualstudio.com/
2. Download and install

---

## 💻 PART 2: Run Locally First (Test on Your Computer)

### Step 2.1: Extract and Open Project

1. Download and extract `ura-analytics.zip`
2. Open VS Code
3. Go to File → Open Folder → Select `ura-analytics` folder

### Step 2.2: Set Up Backend

Open a terminal in VS Code (Terminal → New Terminal):

```bash
# Navigate to backend folder
cd backend

# Install dependencies (downloads required packages)
npm install

# Create your environment file
cp .env.example .env
```

Now edit the `.env` file with your URA credentials:

```
URA_ACCESS_KEY=your_actual_access_key_here
PORT=3001
```

**Note:** You only need the AccessKey - the token is fetched automatically!

Start the backend:

```bash
npm run dev
```

You should see:
```
🚀 Server running on http://localhost:3001
📊 API endpoints available at http://localhost:3001/api
🔑 Fetching new URA token...
✅ New token obtained, valid for 23 hours
```

**Keep this terminal running!**

### Step 2.3: Set Up Frontend

Open a NEW terminal tab (Terminal → New Terminal):

```bash
# Navigate to frontend folder
cd frontend

# Install dependencies
npm install

# Start the frontend
npm run dev
```

You should see:
```
VITE v5.0.0  ready in 500 ms

➜  Local:   http://localhost:5173/
```

### Step 2.4: Test It!

1. Open your browser
2. Go to: http://localhost:5173
3. You should see your property analytics dashboard with real URA data!

---

## 🌐 PART 3: Deploy to the Internet (Make it Public)

We'll use **free services**:
- **Railway** for the backend (API server)
- **Vercel** for the frontend (website)

### Step 3.1: Create Accounts

1. **GitHub** (required): https://github.com/signup
2. **Railway**: https://railway.app/ (sign in with GitHub)
3. **Vercel**: https://vercel.com/ (sign in with GitHub)

### Step 3.2: Push Code to GitHub

First, create a GitHub repository:

1. Go to https://github.com/new
2. Repository name: `ura-property-analytics`
3. Keep it **Public** or **Private** (your choice)
4. Click "Create repository"

Then push your code (run in the `ura-analytics` folder):

```bash
# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit"

# Connect to GitHub (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/ura-property-analytics.git

# Push code
git branch -M main
git push -u origin main
```

---

### Step 3.3: Deploy Backend on Railway

1. Go to https://railway.app/dashboard
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your `ura-property-analytics` repository
5. Railway will ask which folder - select **"backend"** as the root directory

**Configure the backend:**

6. Click on your deployed service
7. Go to **"Variables"** tab
8. Add these environment variables:
   ```
   URA_ACCESS_KEY = your_actual_key
   PORT = 3001
   ```
   
   **Note:** Token is automatically fetched daily - you only need AccessKey!

9. Go to **"Settings"** tab
10. Under "Root Directory", enter: `backend`
11. Under "Build Command", enter: `npm install`
12. Under "Start Command", enter: `npm start`

13. Go to **"Networking"** tab
14. Click **"Generate Domain"**
15. You'll get a URL like: `https://ura-backend-production.up.railway.app`

**Copy this URL! You'll need it for the frontend.**

---

### Step 3.4: Deploy Frontend on Vercel

1. Go to https://vercel.com/dashboard
2. Click **"Add New Project"**
3. Import your `ura-property-analytics` repository
4. Configure:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite
   
5. Add Environment Variable:
   ```
   VITE_API_URL = https://your-railway-url.up.railway.app
   ```
   (Use the Railway URL from Step 3.3)

6. Click **"Deploy"**

**Update your frontend code to use the environment variable:**

Before deploying, update `frontend/src/services/api.js`:

```javascript
const API_BASE = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';
```

Commit and push this change:
```bash
git add .
git commit -m "Add production API URL"
git push
```

Vercel will automatically redeploy.

---

### Step 3.5: Update Backend CORS (Important!)

Update `backend/src/index.js` to allow your Vercel domain:

```javascript
// Replace the cors() line with:
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://your-vercel-url.vercel.app'  // Add your Vercel URL
  ]
}));
```

Commit and push - Railway will auto-redeploy.

---

## ✅ PART 4: You're Live!

Your site is now accessible at:
```
https://your-project-name.vercel.app
```

Share this link with anyone!

---

## 💰 Cost Summary

| Service | Free Tier Limits |
|---------|------------------|
| Railway | $5 free credit/month (plenty for this) |
| Vercel | 100GB bandwidth/month (very generous) |
| URA API | Free (government data) |

**Total cost: $0/month** for moderate usage

---

## 🔧 Troubleshooting

### "Cannot connect to API"
- Check Railway logs for errors
- Verify environment variables are set
- Make sure CORS includes your Vercel domain

### "npm install fails"
- Make sure Node.js is installed correctly
- Delete `node_modules` folder and try again

### "URA API returns error"
- Verify your AccessKey and Token are correct
- Tokens may expire - check URA documentation

---

## 📞 Quick Reference

| What | Where |
|------|-------|
| Backend logs | Railway Dashboard → Your service → Logs |
| Frontend logs | Vercel Dashboard → Your project → Functions |
| Redeploy | Push to GitHub - both auto-redeploy |
| Environment vars | Railway/Vercel dashboards |

---

## 🚀 Optional: Custom Domain

Want `propertyanalytics.com` instead of `xxx.vercel.app`?

1. Buy a domain from Namecheap, GoDaddy, or Cloudflare (~$10/year)
2. In Vercel: Project → Settings → Domains → Add your domain
3. Update DNS records as Vercel instructs

---

Need help? Feel free to ask!
