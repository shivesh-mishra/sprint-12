import { useState } from 'react';

// Mirrors the server rule; the server remains the authority.
const USERNAME_RE = /^[A-Za-z0-9_-]{2,20}$/;

export default function Login({ onSubmit, notice }) {
  const [name, setName] = useState('');
   const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const value = name.trim();
    if (!USERNAME_RE.test(value)) {
       setError('Use 2-20 characters: letters, numbers, "_" or "-".');
      return;
    }
    setError('');
    onSubmit(value);
  };

  return (
    <main className="login">
      <form className="login__card" onSubmit={submit} noValidate>
        <h1>Relay</h1>
        <p className="login__lead">Pick a name to join the rooms. Others will see it next to your messages.</p>

        <label htmlFor="username">Your name</label>
        <input
          id="username"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
           autoComplete="off"
          autoFocus
          aria-invalid={Boolean(error)}
          aria-describedby="username-msg"
        />
        <p id="username-msg" className="login__error" role="alert">
          {error || notice}
        </p>

        <button type="submit">Join the chat</button>
      </form>
    </main>
  );
}
