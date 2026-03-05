# Memory Bank Feature

## Overview

The Memory Bank is a feature that allows Puls to remember important information about users across conversations. This creates a more personalized coaching experience by storing facts, preferences, goals, and scheduled reminders.

## Features

### 1. Automatic Memory Extraction
When users share information that should be remembered, Claude automatically extracts and stores it:
- **Facts**: "I'm training for a marathon in June"
- **Preferences**: "I hate running in the morning"
- **Goals**: "I want to lose 5kg by summer"
- **Reminders**: "Remind me to buy new running shoes next week"

### 2. Contextual Memory Recall
All active memories are loaded into the AI context during conversations, allowing Puls to:
- Reference past goals in current advice
- Respect user preferences when making recommendations
- Celebrate progress toward stated goals
- Maintain continuity across sessions

### 3. Scheduled Reminders
Users can set reminders that will be sent via WhatsApp at the scheduled time:
```
User: "Remind me to schedule my physical next Tuesday"
Puls: "Got it bro 💪" [stores reminder for next Tuesday 9am]
```

### 4. Memory Management
Users can interact with their memory bank:
- **List**: "What do you remember about me?"
- **Forget**: "Forget about the marathon"

## Database Schema

```sql
CREATE TABLE user_memories (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  memory_type text CHECK (memory_type IN ('fact', 'preference', 'goal', 'reminder')),
  content text NOT NULL,
  context jsonb DEFAULT '{}',
  scheduled_for timestamptz, -- For reminders
  reminded_at timestamptz, -- When reminder was sent
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz -- Soft delete
);
```

## Implementation Details

### Storage Flow
1. User sends message containing information to remember
2. Claude's response includes a hidden JSON marker: `MEMORY_EXTRACT: {...}`
3. Backend parses the marker and stores memory in database
4. User receives confirmation (optional, embedded in natural response)

### Recall Flow
1. User sends message in active conversation
2. Backend fetches last 20 active memories
3. Memories included in Claude's system prompt
4. Claude references memories naturally in response

### Reminder Flow
1. Cron job runs every hour (scheduled-reminders job)
2. Fetches reminders where `scheduled_for <= NOW()` and `reminded_at IS NULL`
3. Sends WhatsApp message for each due reminder
4. Marks reminder as sent with `reminded_at` timestamp

## API Methods

### Supabase Service
```typescript
// Storage
storeMemory(memoryData: DbMemoryInsert): Promise<DbMemory>

// Retrieval
getActiveMemories(userId: string, limit?: number): Promise<DbMemory[]>
getScheduledReminders(beforeDate: string): Promise<DbMemory[]>
searchMemories(userId: string, searchTerm: string): Promise<DbMemory[]>

// Management
updateMemory(memoryId: string, updates: DbMemoryUpdate): Promise<DbMemory>
deleteMemory(memoryId: string): Promise<void>
```

### Anthropic Service
```typescript
// Generate response with memory context
generateResponse(
  conversationHistory: ConversationMessage[],
  userMessage: string,
  healthData?: UserHealthData,
  memories?: DbMemory[]
): Promise<string>

// Extract memory commands from AI response
extractMemoryCommands(responseText: string): {
  cleanResponse: string;
  memoryExtract?: { type, content, scheduledFor };
  listMemories?: boolean;
  forgetMemory?: { search: string };
}
```

## Usage Examples

### Example 1: Storing a Goal
```
User: "I'm training for a half marathon in Stockholm in May"

[Backend]
- Claude includes: MEMORY_EXTRACT: {"type": "goal", "content": "Training for half marathon in Stockholm in May"}
- Backend stores memory
- User sees: "YO that's sick! Let's make sure your training is on point 💪"
```

### Example 2: Respecting Preferences
```
User: "I really don't like doing cardio"

[Backend stores preference]

Later...
User: "What should I do today?"

Puls: "Your HRV is solid today bro. Hit some weights - I know you're not huge on cardio anyway"
[References stored preference naturally]
```

### Example 3: Scheduled Reminder
```
User: "Remind me to get new insoles next Friday"

[Backend]
- Stores reminder with scheduled_for = next Friday 9am
- User sees: "Got it 👍"

Next Friday at 9am:
Puls: "Yo bro 👋\n\nReminder: Get new insoles"
```

### Example 4: Memory Management
```
User: "What do you remember about me?"

Puls: "Here's what I remember:
- Training for half marathon in Stockholm in May
- Don't like doing cardio
- Want to improve sleep quality"
```

## Cron Jobs

### Scheduled Reminders Job
- **Schedule**: Every hour (`0 * * * *`)
- **Timezone**: Europe/Stockholm
- **Purpose**: Send due reminders via WhatsApp
- **Process**:
  1. Query reminders where scheduled_for <= NOW()
  2. Filter unreminded (reminded_at IS NULL)
  3. Send WhatsApp message
  4. Mark as reminded

## Future Enhancements

### Phase 2 Features
1. **Memory Expiration**: Auto-archive old memories after 6 months
2. **Memory Categories**: Tag memories by topic (fitness, nutrition, recovery)
3. **Memory Insights**: "You said you wanted to lose 5kg - you're halfway there!"
4. **Recurring Reminders**: "Remind me to foam roll every Sunday"
5. **Memory Export**: Download personal data (GDPR compliance)
6. **Smart Memory Detection**: ML model to detect memorable moments
7. **Memory Search**: Natural language search across all memories

### Phase 3 Features
1. **Goal Tracking**: Automatic progress updates on stated goals
2. **Memory Visualization**: Dashboard showing memory timeline
3. **Memory Sharing**: Share goals with accountability partners
4. **Memory Prompts**: "You mentioned wanting to improve sleep - how's that going?"

## Testing

### Manual Testing
```bash
# 1. Set up database
psql -h <supabase-host> -U postgres -d postgres < sql/add_user_memories.sql

# 2. Test memory storage
# Send WhatsApp: "I'm training for a marathon"
# Check: SELECT * FROM user_memories WHERE user_id = '<your-user-id>';

# 3. Test memory recall
# Send WhatsApp: "What should I do today?"
# Verify: Response references your marathon training

# 4. Test scheduled reminder
# Send WhatsApp: "Remind me to buy shoes tomorrow at 3pm"
# Check: SELECT * FROM user_memories WHERE memory_type = 'reminder';
# Wait: Check WhatsApp tomorrow at 3pm

# 5. Test memory listing
# Send WhatsApp: "What do you remember?"
# Verify: Lists all your memories

# 6. Test memory deletion
# Send WhatsApp: "Forget about the marathon"
# Check: Memory soft-deleted (deleted_at IS NOT NULL)
```

## Security Considerations

1. **Data Privacy**: Memories stored in secure PostgreSQL (Supabase)
2. **Soft Deletes**: Deleted memories marked with timestamp, not permanently deleted
3. **User Isolation**: All queries scoped to user_id
4. **No Sensitive Data**: Warn users not to share medical/financial info
5. **GDPR Compliance**: Users can request full memory export/deletion

## Monitoring

Key metrics to track:
- Total memories stored per user
- Memory types distribution (fact/preference/goal/reminder)
- Reminder delivery success rate
- Average memories referenced per conversation
- Memory deletion rate

## Troubleshooting

### Memory not stored
- Check logs for "Memory extraction found"
- Verify Claude is including MEMORY_EXTRACT in response
- Check database connection

### Reminder not sent
- Check cron job is running: `ps aux | grep node`
- Verify scheduled_for timestamp is in past
- Check Twilio rate limits
- Review logs for "Scheduled reminder sent"

### Memory not recalled
- Verify getActiveMemories returns results
- Check deleted_at is NULL for active memories
- Confirm memories included in system prompt
