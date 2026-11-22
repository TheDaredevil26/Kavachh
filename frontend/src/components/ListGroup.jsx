export default function ListGroup({ className = '', children }) {
  return (
    <div
      className={`
        glass-1 rounded-card overflow-hidden
        divide-y divide-biscuit/40
        ${className}
      `}
    >
      {children}
    </div>
  );
}
