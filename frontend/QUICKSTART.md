# Quick Setup Guide - Frontend Static Hosting

## Sevalla Configuration

### 1. Create Static Web Application

In Sevalla dashboard:
- **Application Type:** Static Site
- **Name:** `dispo-rusty-fe`

### 2. Configure Git Repository

- **Repository:** Connect your GitHub repo
- **Branch:** `main` (or `dev`)
- **Root Directory:** `frontend`

### 3. Build Settings

```
Build Command: npm run build
Node Version: 20.x
Publish Directory: dist
```

### 4. Routing Settings

```
Index File: index.html
Error File: index.html
```

### 5. Environment Variables

Add these in Sevalla dashboard:

```bash
VITE_API_URL=https://your-backend.kinsta.app/api
VITE_APP_NAME=Dispo Rusty
NODE_ENV=production
```

### 6. Deploy

Click **Deploy** and wait for build to complete.

### 7. Update Backend CORS

After frontend deploys, update your backend's CORS settings:

```bash
# In backend environment variables:
CORS_ALLOWED_ORIGINS=https://dispo-rusty-fe.kinsta.page
```

---

## That's it! 🚀

Your frontend will be deployed to the Edge (260+ locations) with:
- ✅ Fast global CDN
- ✅ Automatic HTTPS
- ✅ SPA routing support
- ✅ Zero-downtime deployments

### Testing

Visit your deployed URL and verify:
1. Site loads correctly
2. Login/auth works
3. API calls succeed
4. Routes work on refresh
5. No console errors

### Custom Domain (Optional)

Add a custom domain in Sevalla dashboard:
1. Go to your static site settings
2. Click "Add Domain"
3. Follow DNS configuration instructions
4. Update backend CORS to include new domain
