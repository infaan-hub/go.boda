const base = "https://go-boda-admin-web.vercel.app";
const login = await fetch(`${base}/api/ops/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "admin504", password: "Admin009@504" }),
});
const cookie = login.headers.get("set-cookie");
const res = await fetch(`${base}/admin/operators`, { headers: { cookie } });
const html = await res.text();
console.log("status:", res.status);
console.log("Register count:", (html.match(/Register/g) || []).length);
console.log("Rider-Driver count:", (html.match(/Rider-Driver/g) || []).length);
console.log("has showRegister:", html.includes("showRegister"));
// print a snippet around 'Riders & Drivers'
const idx = html.indexOf("Riders");
console.log("snippet:", html.slice(Math.max(0, idx - 200), idx + 200));
