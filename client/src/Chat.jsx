import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';
 const MAX_LEN = 500;
const TYPING_IDLE_MS = 1500; 
const TYPING_EXPIRE_MS = 5000;
const USERNAME_RETRIES = 3; 

function typingLabel(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing...`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
  return 'Several people are typing...';
}

const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function Chat({ username, onExit }) {
  const socketRef = useRef(null);
  const roomRef = useRef('General');
  const typingRef = useRef({ active: false, timer: null });
  const expireRef = useRef(new Map()); 
  const logRef = useRef(null);

  const [status, setStatus] = useState('connecting');
  const [rooms, setRooms] = useState([]);
  const [room, setRoom] = useState('General');
  const [messagesByRoom, setMessagesByRoom] = useState({});
  const [users, setUsers] = useState([]);
  const [typers, setTypers] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

    const addItem = useCallback((item) => {
    setMessagesByRoom((prev) => ({ ...prev, [item.room]: [...(prev[item.room] || []), item].slice(-200) }));
  }, []);

  const clearTypers = useCallback(() => {
    expireRef.current.forEach((t) => clearTimeout(t));
    expireRef.current.clear();
    setTypers([]);
  }, []);
  useEffect(() => {
    let attempts = 0;
    let retryTimer = null;
    const expire = expireRef.current;

    const socket = io(SERVER_URL, {
      auth: { username },
  transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => setStatus('online'));
    socket.on('disconnect', () => setStatus('reconnecting'));

    socket.on('connect_error', (err) => {
      if (err.message === 'USERNAME_TAKEN' && attempts < USERNAME_RETRIES) {
        attempts += 1;
        retryTimer = setTimeout(() => socket.connect(), 400);
        return;
      }
      if (err.message === 'USERNAME_TAKEN' || err.message === 'INVALID_USERNAME') {
        onExit(err.data?.message || 'That username cannot be used.');
      } else if (err.message === 'TOO_MANY_CONNECTIONS') {
        onExit('Too many connections from your network. Try again shortly.');
      } else {
        setStatus('reconnecting'); 
      }
    });

    socket.on('session:ready', ({ rooms: list, room: first }) => {
      setRooms(list);
      setRoom(first);
      roomRef.current = first;
    });

    socket.on('message:new', (m) => addItem({ ...m, kind: 'message' }));
    socket.on('system', (m) => addItem({ ...m, kind: 'system' }));
    socket.on('room:users', ({ room: r, users: list }) => {
      if (r === roomRef.current) setUsers(list);
    });

    socket.on('typing:update', ({ room: r, user, isTyping }) => {
      if (r !== roomRef.current) return;
      clearTimeout(expire.get(user));
       if (isTyping) {
        expire.set(user, setTimeout(() => {
          expire.delete(user);
          setTypers((t) => t.filter((n) => n !== user));
        }, TYPING_EXPIRE_MS));
        setTypers((t) => (t.includes(user) ? t : [...t, user]));
      } else {
        expire.delete(user);
        setTypers((t) => t.filter((n) => n !== user));
      }
    });

    return () => {
      clearTimeout(retryTimer);
      clearTimeout(typingRef.current.timer);
      expire.forEach((t) => clearTimeout(t));
      expire.clear();
      socket.removeAllListeners();
   socket.disconnect();
      socketRef.current = null;
    };
  }, [username]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messagesByRoom, room]);
  const emitTyping = (isTyping) => {
    const t = typingRef.current;
    if (t.active === isTyping) return;
    t.active = isTyping;
    socketRef.current?.emit('typing', { isTyping });
  };

  const onInput = (e) => {
    const value = e.target.value;
    setText(value);
    setError('');
    const t = typingRef.current;
    clearTimeout(t.timer);
    if (value.length === 0) return emitTyping(false);
    emitTyping(true);
    t.timer = setTimeout(() => emitTyping(false), TYPING_IDLE_MS);
  };

  const send = (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || status !== 'online') return;
    clearTimeout(typingRef.current.timer);
    emitTyping(false);
    socketRef.current.emit('message:send', { text: value }, (res) => {
      if (res?.ok) setText('');
      else setError(res?.error || 'Message was not sent.');
    });
  };

  const switchRoom = (next) => {
    if (next === room || status !== 'online') return;
    clearTimeout(typingRef.current.timer);
    emitTyping(false);
    socketRef.current.emit('room:join', { room: next }, (res) => {
      if (!res?.ok) return setError(res?.error || 'Could not join that room.');
       roomRef.current = res.room;
      clearTypers();
      setRoom(res.room);
      setUsers(res.users);
      setError('');
    });
  };

  const items = messagesByRoom[room] || [];
  const label = typingLabel(typers);

  return (
    <div className="app">
      <aside className="side" aria-label="Rooms and people">
        <div className="side__me">
          <span className={`dot dot--${status}`} aria-hidden="true" />
          <div>
            <strong>{username}</strong>
               <small>{status === 'online' ? 'Connected' : status === 'connecting' ? 'Connecting...' : 'Reconnecting...'}</small>
          </div>    </div>
 
        <nav>
          <h2>Rooms</h2>
          <ul className="rooms">
            {rooms.map((r) => (
              <li key={r}>
                <button
                  type="button"
                  className={r === room ? 'room room--active' : 'room'}
                  aria-current={r === room ? 'true' : undefined}
                  onClick={() => switchRoom(r)}
                >
                  {r}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section>
          <h2>In {room} ({users.length})</h2>
          <ul className="people">
            {users.map((u) => (
              <li key={u} className={u === username ? 'people--me' : undefined}>{u}{u === username ? ' (you)' : ''}</li>
            ))}
          </ul>
        </section>

        <button type="button" className="leave" onClick={() => onExit('')}>Leave chat</button>
      </aside>

      <main className="main">
        <header className="main__head">
          <h1>{room}</h1>
        </header>

        <div className="log" ref={logRef} role="log" aria-live="polite" aria-label={`${room} messages`}>
          {items.length === 0 && <p className="empty">No messages yet. Say hello to {room}.</p>}
          {items.map((m) =>
            m.kind === 'system' ? (
              <p key={m.id} className="line line--system">{m.text}</p>
            ) : (
              <p key={m.id} className={m.user === username ? 'line line--mine' : 'line'}>
                {}
                <span className="who">[{m.user}]:</span> <span className="body">{m.text}</span>
                <time dateTime={new Date(m.ts).toISOString()}>{time(m.ts)}</time>
              </p>
            ),
          )}
        </div>

        <div className="typing" aria-live="polite">{label}</div>

        <form className="composer" onSubmit={send}>
          <label htmlFor="msg" className="sr-only">Message {room}</label>
          <input
            id="msg"
            value={text}
            onChange={onInput}
            maxLength={MAX_LEN}
              placeholder={`Message ${room}`}
            autoComplete="off"
            disabled={status !== 'online'}
          />
          <button type="submit" disabled={status !== 'online' || !text.trim()}>Send</button>
        </form>
        <p className="composer__msg" role="alert">{error}</p>
   </main>
    </div>
  );
}
