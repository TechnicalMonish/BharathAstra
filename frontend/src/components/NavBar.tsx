import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/documents", label: "Document Analyzer" },
  { to: "/resources", label: "Resource Aggregator" },
  { to: "/cost", label: "Cost Predictor" },
];

export default function NavBar() {
  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <NavLink
            to="/"
            className="text-xl font-bold text-indigo-600 shrink-0"
          >
            AWS Doc Intelligence
          </NavLink>

          <div className="flex space-x-1 sm:space-x-4">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-indigo-100 text-indigo-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
