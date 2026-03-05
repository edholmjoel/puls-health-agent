# Puls Health Agent

An AI-powered health coaching platform that delivers personalized daily health briefs via WhatsApp. Puls integrates with wearable devices through Junction API, analyzes health data using Claude AI, and provides conversational coaching to help users optimize their health and fitness.

## Features

- **Proactive Daily Briefs**: Automated morning health summaries sent at 7am with personalized insights
- **Conversational AI Coaching**: Chat with your AI health coach anytime via WhatsApp
- **Wearable Integration**: Connects with Garmin, Fitbit, Oura, and other devices via Junction API
- **Smart Onboarding**: Guided setup process with state machine-driven conversation flow
- **Data-Driven Insights**: Analyzes sleep, activity, workouts, and vitals to provide actionable recommendations
- **Proactive Notifications**: Bot initiates conversations when interesting data appears (workouts, HRV drops, poor sleep)
- **Stale Data Detection**: Automatic alerts when wearable hasn't synced in 24+ hours
- **Manual Data Refresh**: Users can trigger instant data sync with "refresh" command
- **Memory Bank**: AI remembers goals, preferences, and context across conversations
- **Scheduled Reminders**: Set reminders that trigger at specific times

## Tech Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **AI**: Anthropic Claude 3.5 Sonnet
- **Messaging**: Twilio WhatsApp API
- **Wearables**: Junction API (EU region)
- **Scheduling**: Cron jobs with timezone support
- **Logging**: Winston

## Architecture

```
┌─────────────┐
│   WhatsApp  │
│    Users    │
└──────┬──────┘
       │
       ├─────────────────────────┐
       │                         │
       v                         v
┌─────────────┐          ┌──────────────┐
│   Twilio    │          │   Wearable   │
│  Webhooks   │          │   Devices    │
└──────┬──────┘          └──────┬───────┘
       │                        │
       │                        v
       │                 ┌──────────────┐
       │                 │   Junction   │
       │                 │     API      │
       │                 └──────┬───────┘
       │                        │
       v                        v
┌────────────────────────────────────────┐
│         Puls Health Agent              │
│  ┌──────────────────────────────────┐  │
│  │   State Machine & Routing        │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │   Services Layer                 │  │
│  │   - Supabase (DB)                │  │
│  │   - Anthropic (AI)               │  │
│  │   - Junction (Wearables)         │  │
│  │   - Twilio (Messaging)           │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │   Cron Jobs                      │  │
│  │   - Daily Briefs (7am CET)       │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
       │
       v
┌──────────────┐
│   Supabase   │
│  PostgreSQL  │
└──────────────┘
```

## Project Structure

```
puls-health-agent/
├── src/
│   ├── routes/              # Webhook handlers
│   │   ├── webhook-junction.ts
│   │   └── webhook-twilio.ts
│   ├── services/            # External service clients
│   │   ├── supabase.ts
│   │   ├── junction.ts
│   │   ├── twilio.ts
│   │   ├── anthropic.ts
│   │   └── notifications.ts
│   ├── jobs/                # Scheduled tasks
│   │   ├── daily-brief.ts
│   │   ├── scheduled-reminders.ts
│   │   ├── stale-data-check.ts
│   │   └── index.ts
│   ├── middleware/          # Express middleware
│   │   ├── errorHandler.ts
│   │   └── requestLogger.ts
│   ├── types/               # TypeScript definitions
│   │   ├── database.ts
│   │   ├── junction.ts
│   │   ├── twilio.ts
│   │   └── conversation.ts
│   ├── errors/              # Custom error classes
│   │   └── AppError.ts
│   ├── utils/               # Utilities
│   │   └── logger.ts
│   └── index.ts             # Application entry point
├── docs/                   # Documentation
│   ├── RAILWAY_DEPLOYMENT.md
│   └── BETA_USER_GUIDE.md
├── .env.example
├── .railwayignore
├── package.json
├── tsconfig.json
└── README.md
```

## Setup

### Prerequisites

- Node.js 20 or higher
- npm or yarn
- Supabase account with database tables created
- Junction API account (EU region)
- Twilio account with WhatsApp sandbox
- Anthropic API key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd puls-health-agent
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your actual credentials:
```bash
# Server
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# Junction (EU Sandbox)
JUNCTION_API_KEY=your-junction-api-key
JUNCTION_WEBHOOK_SECRET=whsec_your-webhook-secret

# Twilio
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Anthropic
ANTHROPIC_API_KEY=your-anthropic-api-key
```

4. Build the project:
```bash
npm run build
```

## Development

Run the development server with hot reload:
```bash
npm run dev
```

The server will start on `http://localhost:3000`.

### Available Endpoints

- `GET /` - API information
- `GET /health` - Health check
- `POST /webhooks/junction` - Junction webhook handler
- `POST /webhooks/twilio` - Twilio WhatsApp webhook handler

### Testing Webhooks Locally

Use ngrok to expose your local server:

```bash
ngrok http 3000
```

Update webhook URLs:
- **Junction**: Dashboard → Webhooks → `https://<ngrok-url>/webhooks/junction`
- **Twilio**: Console → WhatsApp → Sandbox Settings → `https://<ngrok-url>/webhooks/twilio`

## Database Schema

The application expects the following Supabase tables:

### users
```sql
id: uuid (primary key)
phone_number: text (unique)
name: text (nullable)
junction_user_id: text (nullable)
onboarding_complete: boolean (default: false)
created_at: timestamp
updated_at: timestamp
```

### conversation_state
```sql
id: uuid (primary key)
user_id: uuid (foreign key → users.id)
state: text
context: jsonb
created_at: timestamp
updated_at: timestamp
```

### wearable_data
```sql
id: uuid (primary key)
user_id: uuid (foreign key → users.id)
data_type: text
data: jsonb
source_event_id: text (unique)
received_at: timestamp
```

### daily_briefs
```sql
id: uuid (primary key)
user_id: uuid (foreign key → users.id)
date: date
content: text
sent_at: timestamp (nullable)
created_at: timestamp
```

## User Onboarding Flow

1. **New User** (`state: new`)
   - User sends first WhatsApp message
   - System creates user record
   - Bot asks for name

2. **Name Collection** (`state: awaiting_name`)
   - User provides name
   - System creates Junction user
   - Bot sends wearable connection link

3. **Wearable Connection** (`state: awaiting_connection`)
   - User connects wearable device
   - Junction webhook confirms connection
   - Bot sends confirmation message

4. **Active** (`state: active`)
   - User receives daily briefs at 7am
   - User can chat with AI coach anytime
   - System analyzes and stores wearable data

## Daily Brief Job

The daily brief job runs at **7:00 AM Europe/Stockholm** every day.

For each active user:
1. Fetches wearable data from last 7 days
2. Generates personalized brief using Claude AI
3. Sends brief via WhatsApp
4. Stores brief in database

If no data is available, sends an encouraging reminder to sync their device.

## Error Handling

The application implements comprehensive error handling:

- **Operational Errors**: Expected errors (validation, not found, etc.) with proper HTTP status codes
- **Webhook Errors**: Always return 200 OK to prevent retries, log errors internally
- **Service Errors**: Wrapped in `ExternalServiceError` with service name
- **Unhandled Errors**: Logged with full context and stack traces

All errors are logged with:
- Request ID for tracing
- User context when available
- Full stack traces in development
- Structured JSON format

## Logging

Winston logger with multiple transports:

- **Console**: Colorized output in development, JSON in production
- **Files** (production only):
  - `logs/error.log` - Error level and above
  - `logs/combined.log` - All log levels

Log levels: `error`, `warn`, `info`, `debug`

## Production Deployment

### Build for Production

```bash
npm run build
npm start
```

### Environment Variables

Ensure all production credentials are set:
- Use production URLs for Supabase, Junction, Twilio
- Set `NODE_ENV=production`
- Set appropriate `LOG_LEVEL` (info or warn)
- Remove `JUNCTION_WEBHOOK_SECRET` sandbox prefix

### Recommended Hosting

- **Platform**: Railway, Render, Fly.io, or any Node.js host
- **Requirements**: Node.js 20+, persistent storage for logs
- **Scaling**: Horizontal scaling supported (stateless)

### Health Checks

Use the `/health` endpoint for:
- Load balancer health checks
- Monitoring uptime
- Container orchestration

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T07:00:00.000Z",
  "uptime": 3600.5
}
```

## Monitoring

Recommended monitoring:
- **Application**: Winston logs → Log aggregation service (Datadog, LogDNA)
- **API Uptime**: Ping `/health` endpoint every 5 minutes
- **Webhooks**: Monitor Junction and Twilio webhook receipt rates
- **Cron Jobs**: Check daily brief completion in logs

## Security

- **Webhook Verification**: Svix signature verification for Junction, Twilio signature validation
- **Environment Variables**: Never commit `.env` to version control
- **API Keys**: Use service keys with appropriate permissions
- **Headers**: Helmet.js for security headers
- **Validation**: Zod schemas for request validation (future enhancement)

## Troubleshooting

### Webhooks Not Received

1. Verify ngrok/public URL is correct in webhook settings
2. Check webhook signature verification isn't failing
3. Review logs for incoming requests
4. Test with webhook testing tools

### Daily Briefs Not Sending

1. Check cron job is initialized: Look for "Daily brief job scheduled" in logs
2. Verify timezone: Should show "Europe/Stockholm"
3. Check active users count: `onboarding_complete = true`
4. Review Twilio rate limits

### Wearable Data Not Syncing

1. Verify Junction webhook URL is set correctly
2. Check Junction webhook secret matches `.env`
3. Confirm user's device is connected in Junction dashboard
4. Review webhook event logs in Junction dashboard

### User Stuck in Onboarding

1. Check conversation state in database
2. Review state transitions in logs
3. Manually update state if needed:
```sql
UPDATE conversation_state
SET state = 'active'
WHERE user_id = '<user-id>';

UPDATE users
SET onboarding_complete = true
WHERE id = '<user-id>';
```

## API Rate Limits

- **Twilio**: 1 message/second to same number
- **Anthropic**: 50 requests/minute (tier-dependent)
- **Junction**: Contact provider for limits

Implement exponential backoff if rate limits are hit.

## Documentation

- **[Railway Deployment Guide](docs/RAILWAY_DEPLOYMENT.md)** - Step-by-step production deployment
- **[Beta User Guide](docs/BETA_USER_GUIDE.md)** - Instructions for beta testers

## Future Enhancements

- [ ] Multi-timezone support (per-user timezone)
- [ ] Custom brief scheduling preferences
- [ ] Weekly/monthly summary reports
- [ ] Goal tracking and progress visualization
- [ ] Integration with nutrition tracking apps
- [ ] Advanced analytics dashboard
- [ ] Multi-language support
- [ ] Voice note responses via WhatsApp
- [ ] Junction production API migration

## License

MIT

## Support

For issues or questions:
- Check logs in `logs/` directory
- Review error messages in Winston output
- Consult API documentation for external services
- Open an issue in the repository
