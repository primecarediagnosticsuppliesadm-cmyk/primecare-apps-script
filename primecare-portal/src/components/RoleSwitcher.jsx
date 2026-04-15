import { ROLES, ROLE_LABELS } from "../config/roles";

export default function RoleSwitcher({ role, setRole }) {
  return (
    <div className="flex gap-2 mb-4">
      {Object.values(ROLES).map((r) => (
        <button
          key={r}
          onClick={() => setRole(r)}
          className={`px-3 py-1 rounded ${
            role === r ? "bg-black text-white" : "bg-gray-200"
          }`}
        >
          {ROLE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}