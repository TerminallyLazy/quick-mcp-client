import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function ServerManager({ servers, onAdd, onDelete }) {
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [envJson, setEnvJson] = useState('');
  const [expanded, setExpanded] = useState({});
  const [enabled, setEnabled] = useState({});
  const [serverTools, setServerTools] = useState({});

  useEffect(() => {
    const initEnabled = {};
    servers.forEach(s => {
      initEnabled[s] = enabled[s] !== false;
    });
    setEnabled(initEnabled);
  }, [servers]);

  const toggleExpand = async (s) => {
    const isOpen = expanded[s];
    setExpanded(prev => ({ ...prev, [s]: !isOpen }));
    if (!isOpen && serverTools[s] === undefined) {
      try {
        const res = await axios.get('http://localhost:8000/tools', { params: { server: s } });
        setServerTools(prev => ({ ...prev, [s]: res.data }));
      } catch (err) {
        console.error(`Failed to fetch tools for ${s}`, err);
        setServerTools(prev => ({ ...prev, [s]: [] }));
      }
    }
  };

  const handleToggleEnabled = (s) => {
    setEnabled(prev => ({ ...prev, [s]: !prev[s] }));
  };

  const handleAdd = () => {
    if (!name.trim() || !command.trim()) return;
    const config = {
      name: name.trim(),
      command: command.trim(),
      args: args ? args.split(',').map(s => s.trim()) : [],
    };
    if (envJson.trim()) {
      try {
        config.env = JSON.parse(envJson);
      } catch (err) {
        console.error('Invalid env JSON', err);
      }
    }
    onAdd(config);
    setName('');
    setCommand('');
    setArgs('');
    setEnvJson('');
  };

  // Handler to upload mcp_config.json and add servers
  const handleConfigUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        if (json.mcpServers) {
          Object.entries(json.mcpServers).forEach(([name, cfg]) => {
            const config = {
              name,
              command: cfg.command,
              args: cfg.args || [],
              env: cfg.env || {},
            };
            onAdd(config);
          });
        } else {
          console.error('Invalid mcp_config.json: missing "mcpServers" key');
        }
      } catch (err) {
        console.error('Failed to parse mcp_config.json', err);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="card bg-base-100 shadow p-4">
      <h2 className="card-title">MCP Servers</h2>
      <div className="space-y-2">
        {servers.map(s => (
          <div key={s} className="border rounded p-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={Boolean(enabled[s])}
                  onChange={() => handleToggleEnabled(s)}
                  className="toggle toggle-primary"
                />
                <button onClick={() => toggleExpand(s)} className="text-lg font-medium">
                  {s}
                </button>
              </div>
              <button onClick={() => onDelete(s)} className="btn btn-error btn-xs">
                Delete
              </button>
            </div>
            {expanded[s] && (
              <div className="mt-2 pl-8">
                <h3 className="font-semibold">Tools exposed by {s}:</h3>
                {serverTools.hasOwnProperty(s) ? (
                  serverTools[s].length > 0 ? (
                    <ul className="list-disc ml-5">
                      {serverTools[s].map(tool => (
                        <li key={tool.name} className="mb-2">
                          <p className="font-bold text-blue-500">{tool.name}</p>
                          <p>{tool.description}</p>
                          <pre className="bg-black p-2 text-white rounded text-md overflow-auto">
                            <code className="language-json">
                              {JSON.stringify(tool.input_schema, null, 2)}
                            </code>
                          </pre>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-md text-gray-700">No tools available for {s}.</p>
                  )
                ) : (
                  <p>Loading tools...</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="divider"></div>
      <div className="mb-2">
        <label className="block mb-1 text-sm font-medium">Upload mcp_config.json</label>
        <input
          type="file"
          accept=".json"
          onChange={handleConfigUpload}
          className="input input-bordered w-full mb-2"
        />
      </div>
      <h2 className="text-lg font-bold">Add MCP Server</h2>
      <input
        type="text"
        placeholder="Name"
        value={name}
        onChange={e => setName(e.target.value)}
        className="input input-bordered w-full mb-2"
      />
      <input
        type="text"
        placeholder="Command"
        value={command}
        onChange={e => setCommand(e.target.value)}
        className="input input-bordered w-full mb-2"
      />
      <input
        type="text"
        placeholder="Args (comma-separated)"
        value={args}
        onChange={e => setArgs(e.target.value)}
        className="input input-bordered w-full mb-2"
      />
      <textarea
        placeholder={`Env JSON (optional, e.g. {"KEY":"VALUE"})`}
        value={envJson}
        onChange={e => setEnvJson(e.target.value)}
        className="textarea textarea-bordered w-full mb-2"
      />
      <button onClick={handleAdd} className="btn btn-primary w-full">
        Add
      </button>
    </div>
  );
}