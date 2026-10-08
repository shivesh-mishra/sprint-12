> Sprint 12, Track B (Fullstack) — **Relay**, a Socket.io live chat app.
> Stack: Express + Socket.io (server) / React 18 + Vite (client).

I built this project by hand. AI was used only for a few specific blockers
where I was stuck on *why* something was happening, not on *how* to write the
code. Each prompt below is a one-line question I actually asked, what I took
from the answer, and what I wrote myself afterward.

Everything not listed below — the React components, the CSS, the Socket.io
event contract, the room logic, the HTTP layer, the deployment config, the
tests, and the README — was written without AI.

---

## Prompts

**1. Socket.io CORS**
```
Express CORS is configured but my Socket.io client still fails the handshake with a CORS error — where do I configure CORS for Socket.io?
```
Took from it: Socket.io CORS lives on the `Server` constructor, not Express.
Wrote myself: the `allowRequest` hook, because raw WebSocket clients ignore CORS headers.

**2. React 18 StrictMode**
```
React 18 StrictMode is opening two sockets and rendering duplicate messages — what is the minimal useEffect cleanup that fixes it?
```
Took from it: the effect runs, cleans up, and runs again; the cleanup must call `socket.disconnect()`.
Wrote myself: the cleanup, and the `USERNAME_TAKEN` retry logic — the model did not mention that the second connect fires before the first username is released.

**3. Emit variants**
```
Which Socket.io emit variant should I use for a chat message that must reach the sender, versus a typing indicator that must not?
```
Took from it: `io.to(room).emit` includes the sender; `socket.to(room).emit` excludes it.
Note: the brief says "all clients", but excluding the sender for typing is the right UX and matches FAQ #9 — I made that call myself.

**4. Negative tests**
```
How do I write a negative assertion in node:test with socket.io-client — proving an event does NOT arrive within 400ms — without it being flaky?
```
Took from it: wrap a `once()` listener in a promise that rejects on the event and resolves on a timeout.
Wrote myself: all 8 tests, and the `client()` / `once()` / `silent()` / `emitAck()` helpers.

---