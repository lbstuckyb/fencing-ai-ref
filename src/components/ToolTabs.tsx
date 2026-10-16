import { NavLink } from 'react-router-dom';
import { TOOLS } from '../nav';

/** Switches between the tuning pages, which share the gear in the top bar. */
export default function ToolTabs() {
  return (
    <nav aria-label="Tuning" className="mb-6 flex gap-2">
      {TOOLS.map((tool) => (
        <NavLink
          key={tool.path}
          to={tool.path}
          end
          className={({ isActive }) => `btn ${isActive ? 'border-chalk bg-chalk text-ink' : ''}`}
        >
          {tool.label}
        </NavLink>
      ))}
    </nav>
  );
}
