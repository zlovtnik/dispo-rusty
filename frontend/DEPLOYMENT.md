# Frontend Deployment Configuration - Dispo Rusty

## Sevalla Static Web Hosting Setup

### Site Configuration

| Setting | Value |
|---------|-------|
| **Site name** | `dispo-rusty-fe` |
| **Branch** | `main` (or `dev`) |
| **Build command** | `npm run build` |
| **Node version** | `20.x` (Latest LTS) |
| **Root directory** | `frontend` |
| **Publish directory** | `dist` |
| **Index file** | `index.html` |
| **Error file** | `index.html` |

### Required Environment Variables

Set these in your Sevalla dashboard under **Environment Variables**:

```bash
# Backend API URL (your backend deployment)
VITE_API_BASE_URL=https://your-backend.kinsta.app/api

# Application name
VITE_APP_NAME=Dispo Rusty

# Build environment
NODE_ENV=production
```

### Build Process

The frontend build process:
1. Validates environment variables (`scripts/validate-env.js`)
2. Runs Vite build to generate static files
3. Outputs to `dist/` directory
4. Copies `_redirects` file for SPA routing

### SPA Routing

The `_redirects` file ensures that:
- All routes are handled by React Router
- Page refreshes work correctly
- Direct URL access works
- 404s redirect to `index.html`

### Post-Deployment

After deployment, verify:
1. ✅ Site loads at your Sevalla URL
2. ✅ API calls reach your backend
3. ✅ React Router navigation works
4. ✅ Page refresh maintains routes
5. ✅ CORS is configured on backend for your frontend domain

### Connecting to Backend

Update your backend's CORS configuration to allow your frontend domain:

```bash
# In your backend deployment, set:
CORS_ALLOWED_ORIGINS=https://dispo-rusty-fe.kinsta.page,https://your-custom-domain.com
```

### Alternative: Using Bun

If your static hosting supports custom build commands with Bun:

```bash
curl -fsSL https://bun.sh/install | bash && \
export PATH="$HOME/.bun/bin:$PATH" && \
bun install && \
bun run build:bun
```

### Troubleshooting

**Build fails with missing env vars:**
- Ensure all `VITE_*` variables are set in Sevalla dashboard

**404 errors on routes:**
- Verify `_redirects` file is in `public/` directory
- Check that error file is set to `index.html`

**API calls fail:**
- Check `VITE_API_BASE_URL` points to correct backend URL
- Verify CORS is configured on backend
- Check browser console for CORS errors

**White screen:**
- Check browser console for JavaScript errors
- Verify all assets loaded correctly
- Check that base path in `vite.config.ts` is correct

### Local Development

```bash
cd frontend

# Install dependencies
npm install  # or bun install

# Start dev server
npm run dev  # or bun run dev

# Build for production
npm run build  # or bun run build:bun

# Preview production build
npm run preview
```

### Files Reference

- `.sevalla.yml` - Sevalla configuration reference
- `public/_redirects` - SPA routing rules
- `scripts/validate-env.js` - Environment validation
- `vite.config.ts` - Vite build configuration
- `.env.example` - Environment variable template
