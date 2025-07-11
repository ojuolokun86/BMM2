# BMM (TECHITOON-BOT)

Techitoon Bot BMM is a multi-user, multi-instance WhatsApp bot built with Node.js, Baileys, and Supabase.  
It supports advanced group management, user subscriptions, memory limits, admin controls, and a rich set of commands for both users and admins.

---

## 🚀 Features

- **Multi-User, Multi-Instance:** Each user can run their own bot instance, with subscription-based limits.
- **Admin Dashboard:** Web dashboard for managing users, bots, memory, and subscriptions.
- **Subscription System:** Multiple subscription levels (free, basic, trier, gold, premium) with bot, memory, and feature limits.
- **Group Modes:** Per-group command permissions (`me`, `admin`, `all`), with admin and superadmin role support.
- **Command Routing:** Commands are routed based on group mode and user permissions.
- **Welcome & Warning System:** Custom welcome messages, enable/disable per group, warning/kick system with thresholds.
- **Anti-Link Protection:** Advanced anti-link with bypass lists, admin bypass, user bypass, and warning counts.
- **Profile & Status Management:** Set bot name, profile picture, About Me, and presence (including dynamic presence).
- **View-Once & Status Viewing:** Repost view-once media, enable/disable status viewing, auto-react to statuses.
- **Polls & Announcements:** Create polls, end polls, schedule announcements.
- **Memory & Analytics:** Per-bot memory usage, uptime, last active, and analytics tracking.
- **Admin Commands:** Add/delete/pause/resume user sessions, send notifications, view live metrics.
- **Robust Session Handling:** Graceful shutdown, memory sync to Supabase, QR code management, reconnection logic.
- **Fun Tagall:** Tag all with random/funny emojis.
- **Extensive Logging:** Detailed logs for debugging, analytics, and activity tracking.
- **Antidelete:** Restores deleted messages/media, per-group or global, with memory cleanup.
- **DND (Do Not Disturb):** Modes for all, voice, video, contacts only, whitelist/blacklist.
- **AI & Fun:** `.ai` (multi-backend), `.imagine` (image gen), fun commands (hug, slap, etc.), emoji/sticker/joke/quote/translate.
- **Downloader:** Download video/audio/lyrics from URLs.
- **Kick Inactive/Kick All/Destroy:** Remove inactive or all non-admins, supports `.cancelk`, `.cancelkick`, `.canceldestroy` to stop operations mid-way.
- **Settings & Customization:** Set prefix, tagformat, name, pic, status, presence, DND, formatrespond, all per-user/group and cached for speed.
- **Complaint System:** Users can submit complaints, admin can view/delete.
- **WebSocket:** Real-time updates for dashboard and QR code delivery.
- **API:** REST API for admin/user/bot/session management.

---

## 📋 Main Commands

### General
- `.menu` - Show all commands
- `.info` - Bot info
- `.about` - About this bot
- `.restart` - Restart your bot

### Customization
- `.prefix <new_prefix>` - Change your command prefix
- `.tagformat` - Toggle formatted/plain tagall

### Group Management
- `.tagall <msg>` - Tag all members
- `.setmode <me/admin>` - Set group mode
- `.antidelete on/off` - Enable/disable antidelete
- `.warn @user <reason>` - Warn a user
- `.resetwarn @user` - Reset warnings
- `.listwarn` - List warnings
- `.warncount <number>` - Set warning threshold
- `.welcome on/off` - Enable/disable welcome messages
- `.setwelcome <msg>` - Set custom welcome message
- `.group info <desc>` - Update group description
- `.group name <name>` - Update group name
- `.group pic` - Update group picture
- `.poll <q>\n<opt1>\n<opt2>` - Create poll
- `.endpoll` - End poll
- `.kick @user` - Remove member
- `.add <number>` - Add member
- `.promote @user` - Promote to admin
- `.demote @user` - Demote admin
- `.clear chat/media` - Clear messages
- `.mute` / `.unmute` - Mute/unmute group
- `.kickall` - Remove all non-admins
- `.announce <interval> <msg>` - Start announcements
- `.announce stop` - Stop announcements
- `.group link` - Get invite link
- `.group revoke` - Revoke invite link
- `.leave` - Leave group
- `.destroy group` - Delete group
- `.cancelk` / `.cancelkick` / `.canceldestroy` - Cancel ongoing kick/destroy operations

### Utility
- `.delete` - Delete bot message
- `.view` - Repost view-once media
- `.status on/off` - Enable/disable status viewing
- `.setname <name>` - Set bot display name
- `.setpic` - Set bot profile picture
- `.setstatus <status>` - Set About Me
- `.presence <type>` - Set presence (available, composing, recording, dynamic, etc.)
- `.seen on/off` - Mark chat as seen
- `.antidelete chaton/chatoff` - Set antidelete for all chats
- `.download video <url>` - Download video
- `.download audio <url>` - Download audio
- `.download lyric <artist/title>` - Download lyrics
- `.ai <your question>` - Ask AI
- `.imagine <prompt>` - Generate image

### Protection
- `.antilink on/off` - Enable/disable anti-link
- `.antilink warncount <number>` - Set warning count
- `.antilink bypassadmin` - Admin bypass
- `.antilink dbadmin` - Remove admin bypass
- `.antilink bypass @user` - Add user to bypass
- `.antilink db @user` - Remove user from bypass
- `.antilink list` - Show anti-link settings
- `.protect on/off` - Enable/disable anti-bug/anti-spam
- `.bug` - Report bug (premium)

### Community
- `.create group <name>` - New group in community
- `.create NG <name>` - New group outside community
- `.admin` - Tag all admins

### Fun & Others
- `.sticker`, `.emoji <emoji>`, `.baka`, `.hug`, `.slap`, `.joke`, `.quote`, `.translate <lang> <text>`, and more.

---

## 🛡️ Admin Features

- View all users, emails, auth IDs, subscription levels, and days left
- Manage user memory limits (RAM/ROM)
- Delete all users
- Restart/delete/stop/start any bot
- Send notifications to users
- View live metrics and analytics

---

## 🛠️ Tech Stack

- Node.js, Express
- Baileys (WhatsApp Web API)
- Supabase (database, auth, storage)
- Socket.IO (real-time dashboard)
- HTML/CSS/JS (dashboard frontend)

---

## 📦 Project Structure

```
src/
  bot/                # Bot core logic
  database/           # DB models and helpers
  message-controller/ # Command handlers
  server/             # Express server & routes
  users/              # User session logic
  utils/              # Utilities (menu, emoji, style, etc.)
  data/               # Country/timezone data
  public/             # Dashboard frontend
```

---

## 📄 Development Notes

See [`development_note.md`](./development_note.md) for a full changelog, feature roadmap, and technical details.

---

## 👤 License

MIT

---

## 🤖 Credits

- Built by Techitoon Team
- Powered by Baileys and Supabase

---

**For setup and deployment instructions, see the comments in `src/index.js` and `development_note.md`.**
