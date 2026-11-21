import assert from "node:assert/strict";
const base=process.env.SMOKE_BASE_URL||"http://localhost:3000";
async function check(path,expected){const r=await fetch(new URL(path,base),{redirect:"manual",signal:AbortSignal.timeout(15000)});assert.ok(expected.includes(r.status),path+": unexpected "+r.status);console.log(path,r.status);return r}
await check("/api/health",[200]);
await check("/login",[200]);
await check("/",[307,308]);
for(const path of ["/api/search","/api/billing","/api/after-sales","/api/after-sales/refunds","/api/staff-workspace","/api/communications/automation"])await check(path,[401,403]);
console.log("Smoke checks passed");
