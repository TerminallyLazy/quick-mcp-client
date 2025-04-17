import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Chat from './components/Chat';
import ServerManager from './components/ServerManager';
import ToolPanel from './components/ToolPanel';
import ProgressPanel from './components/ProgressPanel';

function App() {
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [tools, setTools] = useState([]);
  const [logs, setLogs] = useState([]);
  const [chatSessionId, setChatSessionId] = useState(null);
  const [connectionHistory, setConnectionHistory] = useState(() => {
    const stored = localStorage.getItem('mcpHistory');
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    const restoreAndFetch = async () => {
      try {
        const existing = (await axios.get('http://localhost:8000/servers')).data;
        for (const entry of connectionHistory) {
          if (!existing.includes(entry.name)) {
            await axios.post('http://localhost:8000/servers', {
              name: entry.name,
              command: entry.command,
              args: entry.args,
            });
            addLog({ type: 'info', message: `Restored MCP Server ${entry.name}` });
          }
        }
      } catch (err) {
        console.error('Error restoring servers:', err);
      }
      fetchServers();
    };
    restoreAndFetch();
  }, []);

  useEffect(() => {
    localStorage.setItem('mcpHistory', JSON.stringify(connectionHistory));
  }, [connectionHistory]);

  useEffect(() => {
    fetchTools(selectedServer);
  }, [selectedServer]);

  const fetchServers = async () => {
    try {
      const res = await axios.get('http://localhost:8000/servers');
      setServers(res.data);
      if (!selectedServer && res.data.length > 0) {
        setSelectedServer(res.data[0]);
      }
    } catch (e) {
      console.error(e);
      addLog({ type: 'error', message: 'Failed to fetch servers.' });
    }
  };

  const fetchTools = async (server) => {
    try {
      let url = 'http://localhost:8000/tools';
      if (server) {
        url += `?server=${server}`;
      }
      const res = await axios.get(url);
      setTools(res.data);
    } catch (e) {
      console.error(e);
      addLog({ type: 'error', message: 'Failed to fetch tools.' });
    }
  };

  const addLog = (log) => {
    setLogs((prev) => [...prev, log]);
  };

  const handleChatSend = async (message) => {
    addLog({ type: 'user', message });
    const payload = { message };
    if (chatSessionId) payload.session_id = chatSessionId;
    try {
      addLog({ type: 'loading', message: 'Waiting for response...' });
      const res = await axios.post('http://localhost:8000/chat', payload);
      const { session_id, response } = res.data;
      setChatSessionId(session_id);
      addLog({ type: 'assistant', message: response });
    } catch (e) {
      console.error(e);
      addLog({ type: 'error', message: 'Error during chat.' });
    }
  };

  const handleAddServer = async (config) => {
    // Ignore duplicate server names
    if (servers.includes(config.name)) {
      addLog({ type: 'warn', message: `Server ${config.name} already exists; ignoring.` });
      return;
    }
    try {
      await axios.post('http://localhost:8000/servers', config);
      fetchServers();
      addLog({ type: 'info', message: `Server ${config.name} added.` });
      const entry = {
        name: config.name,
        command: config.command,
        args: config.args,
        timestamp: new Date().toISOString(),
      };
      setConnectionHistory(prev => [...prev, entry]);
    } catch (e) {
      console.error(e);
      addLog({ type: 'error', message: 'Error adding server.' });
    }
  };

  const handleDeleteServer = async (name) => {
    try {
      await axios.delete(`http://localhost:8000/servers/${name}`);
      addLog({ type: 'info', message: `Server ${name} deleted.` });
    } catch (e) {
      console.error(e);
      addLog({ type: 'error', message: 'Error deleting server.' });
    } finally {
      fetchServers();
      if (selectedServer === name) setSelectedServer(null);
    }
  };

  // Compute rolled-up history by server name
  const rolledUpHistory = connectionHistory.reduce((acc, entry) => {
    if (!acc[entry.name]) {
      acc[entry.name] = {
        count: 0,
        lastTimestamp: entry.timestamp,
        command: entry.command,
        args: entry.args,
      };
    }
    acc[entry.name].count++;
    if (new Date(entry.timestamp) > new Date(acc[entry.name].lastTimestamp)) {
      acc[entry.name].lastTimestamp = entry.timestamp;
      acc[entry.name].command = entry.command;
      acc[entry.name].args = entry.args;
    }
    return acc;
  }, {});

  return (
    <div className="flex h-screen">
      <div className="flex flex-col w-2/3 border-r">
        <Chat onSend={handleChatSend} logs={logs} />
      </div>
      <div className="flex flex-col w-1/3 p-4 space-y-4 overflow-y-auto">
        <ServerManager
          servers={servers}
          onAdd={handleAddServer}
          onDelete={handleDeleteServer}
        />
        <div className="card bg-base-100 shadow p-4">
          <h2 className="card-title">Connection History</h2>
          {connectionHistory.length === 0 ? (
            <p className="text-sm text-gray-500">No connections yet.</p>
          ) : (
            <ul className="list-disc ml-5 overflow-y-auto max-h-48">
              {Object.entries(rolledUpHistory).map(([name, summary]) => (
                <li key={name} className="mb-2">
                  <p>
                    <span className="font-semibold">{name}</span> connected {summary.count} times{' '}
                    (last at {new Date(summary.lastTimestamp).toLocaleString()})
                  </p>
                  <p>
                    Command: <code>{summary.command} {summary.args.join(' ')}</code>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <ToolPanel tools={tools} />
        <ProgressPanel logs={logs} />
      </div>
    </div>
  );
}

export default App;
