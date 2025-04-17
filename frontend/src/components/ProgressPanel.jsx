import React from 'react';

export default function ProgressPanel({ logs }) {
  const progressLogs = logs.filter(log => log.type === 'loading');
  return (
    <div className="card bg-base-100 shadow p-4">
      <h2 className="card-title">Progress</h2>
      {progressLogs.length === 0 ? (
        <p className="text-sm text-gray-500">No ongoing tasks</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {progressLogs.map((log, idx) => (
            <li key={idx} className="text-sm text-yellow-600">
              {log.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}