import React, { useState } from 'react';

export default function ToolPanel({ tools }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="card bg-base-100 shadow p-4">
      <h2
        className="card-title flex items-center cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="mr-2">{expanded ? '▾' : '▸'}</span>
        Available Tools
      </h2>
      {expanded && (
        <> 
          {tools.length === 0 ? (
            <p className="text-sm text-gray-500">No tools available</p>
          ) : (
            <ul className="menu menu-compact mt-2">
              {tools.map(tool => (
                <li key={tool.name} className="px-2 py-1">
                  <div className="font-semibold text-blue-500">{tool.name}</div>
                  <div className="text-sm text-gray-100">{tool.description}</div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}