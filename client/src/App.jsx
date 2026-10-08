import { useState } from 'react';
 import Login from './Login.jsx';
import Chat from './Chat.jsx';

export default function App() {
  const [username, setUsername] = useState(null);
  const [notice, setNotice] = useState('');

  if (!username) return <Login onSubmit={setUsername} notice={notice} />;

  return (
    <Chat
     username={username}
      onExit={(reason) => {
        setNotice(reason || '');
        setUsername(null);
      }}
    />
  );
}
