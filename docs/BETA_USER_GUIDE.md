# Join Puls Beta (WhatsApp)

Welcome to the Puls Health Coach beta! This guide will help you get started with your AI-powered health coaching experience.

## What is Puls?

Puls is your personal AI health coach that:
- 📊 Analyzes your wearable data (Garmin, Fitbit, Oura, etc.)
- 💬 Provides personalized health insights via WhatsApp
- 🌅 Sends daily health briefs every morning at 7am (Stockholm time)
- 🏃‍♂️ Celebrates your workouts and achievements
- 💡 Answers your health and fitness questions
- 🧠 Remembers important information about you

## Getting Started

### Step 1: Join the Twilio WhatsApp Sandbox

1. **Save the Twilio number**: `+1 415 523 8886`
2. **Send a WhatsApp message** with the join code: `join <sandbox-code>`
   - Your sandbox code will be provided separately
3. **Wait for confirmation** - You'll get a message from Twilio confirming you've joined

### Step 2: Complete Onboarding

1. **Start the conversation**: Send `Hello` to Puls
2. **Provide your name**: Puls will ask for your name
3. **Connect your wearable**:
   - Puls will send you a connection link
   - Click the link and choose your wearable provider
   - Connect your device (Garmin, Fitbit, Oura, Whoop, etc.)
   - Grant the necessary permissions
4. **Confirm connection**: Send `done` when you've connected
5. **Wait for confirmation**: Puls will confirm when your data is syncing

## Using Puls

### Daily Health Briefs

- **Automatic delivery**: Every morning at 7am Stockholm time
- **Content**: Sleep analysis, recovery status, activity summary, personalized recommendations
- **Manual request**: Send `brief`, `status`, or `today` anytime to get your latest health snapshot

### Asking Questions

You can ask Puls anything about your health and fitness:

- "How did I sleep last night?"
- "What's my HRV trend this week?"
- "Should I work out today or rest?"
- "How many steps have I taken this week?"
- "Why is my sleep quality down?"

### Commands

- **`brief`** or **`status`** - Get your current health status
- **`refresh`** or **`sync`** - Manually sync latest data from your wearable
- **`what do you remember?`** - List all stored memories
- **`forget about X`** - Remove a specific memory

### Memory Bank

Puls remembers important information you tell it:

- **Goals**: "I want to run a marathon in April"
- **Preferences**: "I'm trying to cut back on caffeine"
- **Context**: "I have a bad knee, be careful with running advice"
- **Reminders**: "Remind me to schedule a doctor's appointment next week"

### Proactive Notifications

Puls will sometimes reach out to you:

- **Workout congratulations**: When you complete a workout
- **Data alerts**: When something unusual appears in your data (e.g., HRV drops significantly)
- **Stale data alerts**: If your wearable hasn't synced in 24+ hours

**Rate limiting**: Maximum 3 proactive messages per day, with at least 2 hours between them

## Tips for Best Experience

### 1. Keep Your Wearable Synced

- Ensure your wearable syncs with your phone regularly
- Keep Bluetooth enabled on your phone
- Open your wearable's app periodically to force sync
- If you get a stale data alert, check your device connection

### 2. Talk Naturally

- Puls understands conversational language
- No need for formal commands or structured queries
- Ask follow-up questions - Puls maintains conversation context

### 3. Build Your Memory Bank

- Tell Puls about your goals and preferences
- The more Puls knows about you, the better the advice
- Update Puls when things change

### 4. Use It Daily

- Check your morning brief
- Ask questions when you're curious
- Share updates about your training or health

## Troubleshooting

### "I'm not getting daily briefs"

- Make sure you've completed onboarding (wearable connected)
- Check that you have recent wearable data (last 7 days)
- Briefs are sent at 7am Stockholm time (CEST/CET)

### "My data seems outdated"

- Send `refresh` to manually sync latest data
- Check that your wearable is syncing to your phone
- Make sure your wearable provider's app is connected to Junction

### "I'm not receiving messages"

- Ensure you've joined the Twilio sandbox (Step 1)
- Check that you haven't blocked the number
- Try sending a message to Puls first

### "Puls sent me too many messages"

- Proactive notifications are limited to 3 per day
- You can ask Puls to "stop sending proactive notifications" (future feature)
- Report excessive messaging to the team

## Privacy & Data

- **Data storage**: Your health data is stored securely in Supabase (encrypted PostgreSQL)
- **Data access**: Only you and the Puls system have access to your data
- **Data retention**: Data is retained for analysis and coaching purposes
- **Third-party access**: No third parties have access to your health data
- **Deletion**: Contact the team if you want your data deleted

## Providing Feedback

This is a beta! We want your honest feedback:

- **What's working well?**
- **What's confusing or frustrating?**
- **What features would you like to see?**
- **Any bugs or issues?**

Send feedback directly to Joel or report issues on GitHub.

## Known Limitations (Beta)

- **Sandbox environment**: You're using Twilio's WhatsApp sandbox
  - Messages may have "Twilio Sandbox" prefix
  - Limited to sandbox participants only
- **Provider limitations**: Some wearable providers have rate limits or sync delays
- **Language**: Currently optimized for English only
- **Single timezone**: All scheduled features use Stockholm timezone

## Support

If you run into issues:

1. Try the troubleshooting steps above
2. Send `refresh` to sync latest data
3. Contact Joel directly via WhatsApp or email
4. Report bugs: https://github.com/anthropics/puls-health-agent/issues

---

**Welcome to Puls! Let's optimize your health together. 🚀**
