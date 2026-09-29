# Taskboard – Task Management App

Node.js + Express + SQLite + JWT auth + Socket.IO (real-time) + responsive vanilla JS frontend.

## Run
1. Install Node.js 18+ (https://nodejs.org)
2. `cd task-manager`
3. `npm install`
4. `npm start`
5. Open http://localhost:3000, create an account, add tasks.
   Open a second tab: changes appear instantly (WebSockets).

## Structure
- `server.js` – API, auth (bcrypt + JWT), SQLite (built into Node 22+), Socket.IO
- `public/` – `index.html`, `style.css`, `app.js` (UI, fetch calls, socket client)

## API
| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | /api/register | – | create account |
| POST | /api/login | – | get JWT |
| GET | /api/tasks | yes | list my tasks |
| POST | /api/tasks | yes | create |
| PUT | /api/tasks/:id | yes | update |
| DELETE | /api/tasks/:id | yes | delete |
