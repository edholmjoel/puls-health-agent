# Railway Deployment Guide

This guide walks you through deploying the Puls Health Agent to Railway.

## Prerequisites

- [ ] GitHub repository with latest code
- [ ] Railway account (https://railway.app)
- [ ] All environment variables ready (see .env.example)
- [ ] Supabase instance running with tables created

## Step 1: Create Railway Project

1. **Go to Railway**: https://railway.app
2. **Sign in** with GitHub
3. **Click "New Project"**
4. **Select "Deploy from GitHub repo"**
5. **Choose repository**: `puls-health-agent`
6. **Railway auto-detects**: Node.js project

## Step 2: Configure Environment Variables

Click on your deployment → **Variables** tab

Add all environment variables from your `.env` file:

```bash
# Node Environment
NODE_ENV=production
PORT=3000

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here

# Junction API
JUNCTION_API_KEY=your-junction-key
JUNCTION_WEBHOOK_SECRET=your-webhook-secret
JUNCTION_API_URL=https://api.sandbox.eu.junction.com

# Twilio
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Anthropic
ANTHROPIC_API_KEY=your-anthropic-key

# Optional
LOG_LEVEL=info
```

**Important**:
- Copy values exactly from your working `.env`
- Don't include quotes around values in Railway
- Triple-check API keys are correct

## Step 3: Configure Build & Start Commands

Railway should auto-detect these from `package.json`, but verify:

- **Build Command**: `npm run build`
- **Start Command**: `npm start`

If not set, add them in **Settings** → **Build & Start Commands**

## Step 4: Deploy

1. **Click "Deploy"** (or wait for auto-deploy)
2. **Monitor logs** in the Railway dashboard
3. **Wait 2-3 minutes** for build + deploy

### Expected Log Output

```
Starting Puls Health Agent server
Server started successfully
Available endpoints: /health, /webhooks/junction, /webhooks/twilio
Daily brief job scheduled
Scheduled reminders job initialized
Stale data check job initialized
```

## Step 5: Get Your Railway URL

1. **Go to Settings** → **Networking**
2. **Click "Generate Domain"** (if not already generated)
3. **Copy your URL**: `https://puls-health-production.up.railway.app`

## Step 6: Update Webhook URLs

### Junction Dashboard

1. **Go to**: Junction dashboard → Webhooks
2. **Update URL**: `https://[your-railway-url]/webhooks/junction`
3. **Verify secret** matches `JUNCTION_WEBHOOK_SECRET`
4. **Save changes**

### Twilio Console

1. **Go to**: Twilio Console → Messaging → WhatsApp Sandbox Settings
2. **Update "When a message comes in"**: `https://[your-railway-url]/webhooks/twilio`
3. **Method**: HTTP POST
4. **Save**

## Step 7: Test Deployment

### 1. Health Check

```bash
curl https://[your-railway-url]/health
```

**Expected response**:
```json
{
  "status": "ok",
  "timestamp": "2024-...",
  "uptime": 123.45,
  "environment": "production",
  "services": {
    "database": {
      "status": "healthy",
      "activeUsers": 1
    }
  },
  "jobs": {
    "dailyBrief": { ... },
    "scheduledReminders": { ... },
    "staleDataCheck": { ... }
  }
}
```

### 2. Test Junction Webhook

From Junction dashboard, trigger a test webhook event.

**Check Railway logs**:
```
Junction webhook received
Processing Junction webhook event
```

### 3. Test Twilio Webhook

Send a WhatsApp message to the bot.

**Check Railway logs**:
```
Twilio webhook received
Processing message for user
Generated conversational response
```

### 4. Verify Cron Jobs

**Check logs at scheduled times**:
- 7am Stockholm: "Daily brief job triggered"
- Every hour: "Scheduled reminders job triggered"
- Every 6 hours: "Stale data check cron job triggered"

## Step 8: Monitor

### Railway Dashboard

- **Logs**: Real-time log streaming
- **Metrics**: CPU, memory, network usage
- **Deployments**: History of all deployments

### Check Endpoints Regularly

```bash
# Health check
curl https://[your-railway-url]/health

# Should return 200 OK with service status
```

## Troubleshooting

### Build Fails

**Error**: `npm ERR! missing script: build`
- **Fix**: Ensure `package.json` has `"build": "tsc"` in scripts

**Error**: `typescript not found`
- **Fix**: TypeScript should be in devDependencies, Railway installs all deps

### Deployment Successful But Not Responding

**Check**:
1. Railway logs for startup errors
2. Environment variables are set correctly
3. PORT is set to 3000 (or let Railway auto-assign)

### Webhooks Not Working

**Junction webhook fails**:
- Verify URL is `https://[railway-url]/webhooks/junction`
- Check `JUNCTION_WEBHOOK_SECRET` matches Junction dashboard
- Check Railway logs for "Webhook verification failed"

**Twilio webhook fails**:
- Verify URL is `https://[railway-url]/webhooks/twilio`
- Method must be HTTP POST
- Check Railway logs for "Invalid Twilio webhook signature"

### Cron Jobs Not Running

**Check**:
1. Railway logs for "job initialized" messages on startup
2. Timezone is set to "Europe/Stockholm" in cron jobs
3. Railway doesn't sleep (unlike Heroku free tier - Railway keeps running)

### High Memory Usage

**Normal**: 150-300MB for Node.js app
**High**: 500MB+ sustained

**If high**:
- Check for memory leaks in logs
- Review conversation history size limits
- Consider upgrading Railway plan

## Rollback

If deployment has issues:

1. **Railway Dashboard** → **Deployments**
2. **Click previous working deployment**
3. **Click "Rollback to this deployment"**
4. **Update webhook URLs back to previous URL** (if needed)

## Cost Monitoring

### Expected Monthly Costs (5-10 users)

- **Compute**: ~$10/month (always-on)
- **Egress**: ~$2-5/month
- **Total Railway**: $12-15/month

### Monitor Usage

- Railway Dashboard → **Usage**
- Set up billing alerts in Railway settings

## Scaling Up

When ready for more users:

1. **Monitor metrics** in Railway dashboard
2. **Increase Railway plan** if needed (vertical scaling)
3. **Consider worker separation** for very high load:
   - Separate API server from cron jobs
   - Deploy multiple Railway services

## Production Checklist

- [ ] All environment variables set correctly
- [ ] Railway deployment successful (check logs)
- [ ] Health endpoint returns 200 OK
- [ ] Junction webhook URL updated and tested
- [ ] Twilio webhook URL updated and tested
- [ ] Sent test message, received response
- [ ] Daily brief job scheduled (check next run time)
- [ ] Stale data job scheduled (check next run time)
- [ ] Monitored logs for 24 hours, no errors
- [ ] Set up Railway billing alerts
- [ ] Documented Railway URL in team docs

## Next Steps

1. **Invite beta users** (use docs/BETA_USER_GUIDE.md)
2. **Monitor daily** for first week
3. **Collect feedback** from beta users
4. **Iterate** on features and fixes
5. **Plan for scale** when approaching 10+ users

---

**🚀 Deployment complete! Your health coaching bot is now live 24/7.**
