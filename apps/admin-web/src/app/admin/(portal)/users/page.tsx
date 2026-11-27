"use client";

import * as React from "react";
import { Trash2, Save, Users } from "lucide-react";
import { Button, Card } from "@goboda/ui";

interface UserRow { id: string; phone: string; name: string; role: string; createdAt: string; }

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/users?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        setUsers(j.users ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [q]);

  React.useEffect(() => { void load(); }, [load]);

  const update = async (id: string, patch: Partial<UserRow>) => {
    await fetch(`/api/ops/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this user?")) return;
    await fetch(`/api/ops/users/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl uppercase text-[#17645F]">Users</h1>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." className="rounded-full border border-[#17645F]/20 bg-[#F3EEE8] px-3 py-1.5 text-xs" />
      </div>
      {loading ? <p className="text-sm text-[#17645F]/70">Loading...</p> : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-xs">
            <thead className="bg-[#F3EEE8] text-[#17645F]">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Phone</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-[#17645F]/10">
                  <td className="px-3 py-2">
                    <input defaultValue={u.name} onBlur={(e) => { if (e.target.value !== u.name) update(u.id, { name: e.target.value }); }} className="w-full bg-transparent" />
                  </td>
                  <td className="px-3 py-2">{u.phone}</td>
                  <td className="px-3 py-2">
                    <select defaultValue={u.role} onChange={(e) => update(u.id, { role: e.target.value as UserRow["role"] })} className="rounded border border-[#17645F]/20 bg-[#F3EEE8] px-2 py-1">
                      <option value="CUSTOMER">CUSTOMER</option>
                      <option value="BODABODA_RIDER">BODABODA_RIDER</option>
                      <option value="BAJAJI_DRIVER">BAJAJI_DRIVER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => remove(u.id)} className="text-[#A93232] hover:text-[#8A2626]"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
