import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { and, desc, eq, ne, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  students,
  libraryBooks,
  bookRequests,
  notices,
  assignments,
  syllabus,
  settings,
  auditLog,
  userData,
} from "../../db/schema.js";

type IdentityUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  meta: Record<string, unknown>;
};

type Vars = { user: IdentityUser; isAdmin: boolean; profile: typeof students.$inferSelect | null };

const app = new Hono<{ Variables: Vars }>();

// ---------- helpers ----------

const snake = (s: string) => s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const toSnake = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [snake(k), v]));
const rows = (list: Record<string, unknown>[]) => list.map(toSnake);

const normEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();
const normPhone = (p: unknown) => String(p ?? "").replace(/\D/g, "").slice(-10);
const clean = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

const adminEmails = () =>
  String(process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(normEmail)
    .filter(Boolean);

// Short-lived in-memory cache of verified tokens (a cache only, never storage).
const tokenCache = new Map<string, { user: IdentityUser; exp: number }>();

async function verifyToken(token: string, origin: string): Promise<IdentityUser | null> {
  const hit = tokenCache.get(token);
  if (hit && hit.exp > Date.now()) return hit.user;
  const base = origin || process.env.URL || "";
  try {
    const res = await fetch(new URL("/.netlify/identity/user", base), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const u = await res.json();
    const user: IdentityUser = {
      id: u.id,
      email: normEmail(u.email),
      name: String(u.user_metadata?.full_name ?? ""),
      roles: Array.isArray(u.app_metadata?.roles) ? u.app_metadata.roles : [],
      meta: u.user_metadata ?? {},
    };
    if (tokenCache.size > 500) tokenCache.clear();
    tokenCache.set(token, { user, exp: Date.now() + 60_000 });
    return user;
  } catch {
    return null;
  }
}

const isAdminUser = (u: IdentityUser) => u.roles.includes("admin") || adminEmails().includes(u.email);

async function log(actor: string, action: string) {
  await db.insert(auditLog).values({ actor, action });
}

// Best-effort per-instance rate limiter for public endpoints (serverless instances don't share memory,
// so this slows abuse down but is not a hard guarantee).
const hits = new Map<string, { n: number; reset: number }>();
function rateLimited(key: string, max = 15, windowMs = 60_000): boolean {
  const now = Date.now();
  if (hits.size > 2000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  h.n += 1;
  return h.n > max;
}
const clientIp = (c: { req: { header: (n: string) => string | undefined } }) =>
  c.req.header("x-nf-client-connection-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

// ---------- auth middleware ----------

app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/check-available" || c.req.path === "/api/health") return next();
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : getCookie(c, "nf_jwt");
  if (!token) return c.json({ error: "unauthorized" }, 401);
  const user = await verifyToken(token, new URL(c.req.url).origin);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const isAdmin = isAdminUser(user);
  // Load the student profile once per request and block suspended students on EVERY endpoint.
  const [profile] = await db.select().from(students).where(eq(students.identityId, user.id));
  if (profile?.status === "Suspended" && !isAdmin) return c.json({ error: "suspended" }, 403);
  c.set("user", user);
  c.set("isAdmin", isAdmin);
  c.set("profile", profile ?? null);
  return next();
});

app.use("/api/admin/*", async (c, next) => {
  if (!c.get("isAdmin")) return c.json({ error: "forbidden" }, 403);
  return next();
});

app.get("/api/health", (c) => c.json({ ok: true }));

// ---------- registration helpers ----------

// Public pre-signup check so students get instant feedback on duplicate email / phone.
app.post("/api/check-available", async (c) => {
  if (rateLimited("check:" + clientIp(c))) return c.json({ error: "Too many requests. Please wait a minute and try again." }, 429);
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(body.email);
  const phone = normPhone(body.phone);
  const found = await db
    .select({ email: students.email, phone: students.phone })
    .from(students)
    .where(or(eq(students.email, email), phone ? eq(students.phone, phone) : eq(students.email, email)));
  return c.json({
    emailTaken: found.some((r) => r.email === email),
    phoneTaken: Boolean(phone) && found.some((r) => r.phone === phone),
    adminEmail: adminEmails().includes(email),
  });
});

type ProfileInput = { fullName: string; rollNo: string; course: string; semester: string; phone: string };

function profileFrom(src: Record<string, unknown>): ProfileInput {
  return {
    fullName: clean(src.full_name ?? src.fullName, 120),
    rollNo: clean(src.roll_no ?? src.rollNo, 60),
    course: clean(src.course, 120),
    semester: clean(src.semester, 40),
    phone: normPhone(src.phone),
  };
}

async function saveProfile(user: IdentityUser, p: ProfileInput) {
  if (!p.fullName) return { error: "Please enter your full name." };
  if (p.phone && p.phone.length !== 10) return { error: "Please enter a valid 10-digit mobile number." };
  if (p.phone) {
    const clash = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.phone, p.phone), ne(students.identityId, user.id)));
    if (clash.length) return { error: "This mobile number is already registered with another account.", code: "phone_taken" };
  }
  const values = {
    identityId: user.id,
    email: user.email,
    fullName: p.fullName,
    rollNo: p.rollNo,
    course: p.course,
    semester: p.semester,
    phone: p.phone || null,
  };
  try {
    const [row] = await db
      .insert(students)
      .values(values)
      .onConflictDoUpdate({
        target: students.identityId,
        set: { fullName: values.fullName, rollNo: values.rollNo, course: values.course, semester: values.semester, phone: values.phone, email: values.email },
      })
      .returning();
    return { profile: row };
  } catch {
    return { error: "This email or mobile number is already linked to another student account.", code: "conflict" };
  }
}

// ---------- current user ----------

app.get("/api/me", async (c) => {
  const user = c.get("user");
  const isAdmin = c.get("isAdmin");
  let [profile] = await db.select().from(students).where(eq(students.identityId, user.id));

  // First sign-in after email confirmation: create the profile from signup details.
  let profileError: string | undefined;
  if (!profile && !isAdmin) {
    const p = profileFrom(user.meta);
    if (p.fullName) {
      const r = await saveProfile(user, p);
      if ("profile" in r && r.profile) profile = r.profile;
      else profileError = r.error;
    }
  }
  if (profile?.status === "Suspended" && !isAdmin) {
    return c.json({ error: "suspended" }, 403);
  }
  return c.json({
    user: { id: user.id, email: user.email, name: profile?.fullName || user.name || user.email },
    isAdmin,
    profile: profile ? toSnake(profile) : null,
    profileError,
  });
});

app.post("/api/me/profile", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const r = await saveProfile(c.get("user"), profileFrom(body));
  if ("error" in r) return c.json({ error: r.error, code: r.code }, 409);
  return c.json({ profile: toSnake(r.profile!) });
});

// ---------- student content ----------

app.get("/api/content", async (c) => {
  const semester = clean(c.get("profile")?.semester, 40);
  const isAdmin = c.get("isAdmin");
  const [n, a, s, l, x] = await Promise.all([
    db.select().from(notices).where(eq(notices.active, true)).orderBy(desc(notices.createdAt)),
    db.select().from(assignments).orderBy(desc(assignments.createdAt)),
    db.select().from(syllabus).orderBy(desc(syllabus.createdAt)),
    db.select().from(libraryBooks).orderBy(desc(libraryBooks.createdAt)),
    db.select().from(settings),
  ]);
  // Semester-specific notices are filtered on the server, so students never receive other semesters' notices.
  const visibleNotices = isAdmin ? n : n.filter((x) => !x.audience || x.audience === "All Semesters" || x.audience === semester);
  return c.json({ notices: rows(visibleNotices), assignments: rows(a), syllabus: rows(s), library_books: rows(l), settings: rows(x) });
});

app.get("/api/requests", async (c) => {
  const user = c.get("user");
  const [me] = await db.select().from(students).where(eq(students.identityId, user.id));
  if (!me) return c.json({ requests: [] });
  const list = await db.select().from(bookRequests).where(eq(bookRequests.studentId, me.id)).orderBy(desc(bookRequests.createdAt));
  return c.json({ requests: rows(list) });
});

app.post("/api/requests", async (c) => {
  const user = c.get("user");
  const [me] = await db.select().from(students).where(eq(students.identityId, user.id));
  if (!me) return c.json({ error: "Complete your student profile first." }, 400);
  const body = await c.req.json().catch(() => ({}));
  const title = clean(body.title, 200);
  if (!title) return c.json({ error: "Title is required." }, 400);
  const [row] = await db
    .insert(bookRequests)
    .values({
      studentId: me.id,
      studentName: me.fullName,
      rollNo: me.rollNo,
      semester: me.semester,
      title,
      reqType: clean(body.req_type ?? body.reqType, 40) || "PDF",
      details: clean(body.details, 2000) || null,
    })
    .returning();
  return c.json({ request: toSnake(row) }, 201);
});

// ---------- cloud sync (per-student study data) ----------

// Whitelist of keys the browser may store in the cloud. The three virtual keys split the
// admin-published lists from the student's own items (see public/assets/js/sync.js).
const SYNC_KEYS = new Set([
  "todos", "studyTasks", "savedNotes", "notes", "flashcards", "timetable", "dailyHabits", "dailyPlan",
  "focusLog", "focusMinutes", "focusStreak", "focusSessions", "focusLastDay",
  "studyPrefs", "reminderPrefs", "appearancePrefs", "recent",
  "assignments_mine", "syllabus_mine", "adminDone",
]);
const SYNC_MAX_CHARS = 900_000;

app.get("/api/sync", async (c) => {
  const list = await db.select().from(userData).where(eq(userData.identityId, c.get("user").id));
  return c.json({ items: list.map((r) => ({ key: r.key, value: r.value, updated_at: r.updatedAt })) });
});

app.put("/api/sync/:key", async (c) => {
  const key = c.req.param("key");
  if (!SYNC_KEYS.has(key)) return c.json({ error: "Unknown key" }, 400);
  const body = await c.req.json().catch(() => null);
  if (!body || !("value" in body)) return c.json({ error: "Missing value" }, 400);
  if (JSON.stringify(body.value ?? null).length > SYNC_MAX_CHARS) return c.json({ error: "Too large to sync" }, 413);
  const now = new Date();
  const [row] = await db
    .insert(userData)
    .values({ identityId: c.get("user").id, key, value: body.value, updatedAt: now })
    .onConflictDoUpdate({ target: [userData.identityId, userData.key], set: { value: body.value, updatedAt: now } })
    .returning({ updatedAt: userData.updatedAt });
  return c.json({ ok: true, updated_at: row.updatedAt });
});

// ---------- admin ----------

const TABLES = {
  students,
  library_books: libraryBooks,
  book_requests: bookRequests,
  notices,
  assignments,
  syllabus,
  settings,
  audit_log: auditLog,
} as const;
type TableName = keyof typeof TABLES;

// Columns an admin may set when creating rows.
const INSERTABLE: Partial<Record<TableName, string[]>> = {
  notices: ["title", "body", "audience", "priority"],
  assignments: ["title", "subject", "due", "priority", "minutes", "details"],
  syllabus: ["subject", "chapter", "priority", "target"],
  library_books: ["title", "author", "semester", "resource_url", "file_name"],
};
// Fields an admin may toggle on existing rows.
const UPDATABLE: Partial<Record<TableName, Record<string, (v: unknown) => unknown>>> = {
  students: { status: (v) => (v === "Suspended" ? "Suspended" : "Active") },
  notices: { active: (v) => v === true || v === "true" },
  book_requests: { status: (v) => (["Approved", "Rejected", "Pending"].includes(String(v)) ? String(v) : "Pending") },
};
const DELETABLE: TableName[] = ["students", "library_books", "book_requests", "notices", "assignments", "syllabus"];

const isTable = (t: string): t is TableName => t in TABLES;

app.get("/api/admin/data", async (c) => {
  const out: Record<string, unknown[]> = {};
  await Promise.all(
    (Object.keys(TABLES) as TableName[]).map(async (t) => {
      const table = TABLES[t] as any;
      const list = await db.select().from(table).orderBy(desc(table.createdAt)).limit(t === "audit_log" ? 200 : 2000);
      out[t] = rows(list as Record<string, unknown>[]);
    }),
  );
  return c.json(out);
});

app.post("/api/admin/:table", async (c) => {
  const t = c.req.param("table");
  if (!isTable(t) || !INSERTABLE[t]) return c.json({ error: "Not allowed" }, 400);
  const body = await c.req.json().catch(() => ({}));
  const values: Record<string, unknown> = {};
  for (const k of INSERTABLE[t]!) {
    const v = body[k];
    if (v === undefined || v === null || v === "") continue;
    values[camel(k)] = k === "minutes" ? Number(v) || null : clean(v, 4000);
  }
  try {
    const [row] = await db.insert(TABLES[t] as any).values(values).returning();
    await log(c.get("user").email, `Added to ${t}: ${values.title ?? values.chapter ?? ""}`);
    return c.json({ row: toSnake(row as Record<string, unknown>) }, 201);
  } catch (e) {
    return c.json({ error: "Could not save. Check the required fields." }, 400);
  }
});

app.patch("/api/admin/:table/:id", async (c) => {
  const t = c.req.param("table");
  const id = c.req.param("id");
  if (!isTable(t) || !UPDATABLE[t]) return c.json({ error: "Not allowed" }, 400);
  const body = await c.req.json().catch(() => ({}));
  const set: Record<string, unknown> = {};
  for (const [k, fn] of Object.entries(UPDATABLE[t]!)) if (k in body) set[camel(k)] = fn(body[k]);
  if (!Object.keys(set).length) return c.json({ error: "Nothing to update" }, 400);
  const table = TABLES[t] as any;
  await db.update(table).set(set).where(eq(table.id, id));
  await log(c.get("user").email, `Updated ${t}: ${Object.entries(set).map(([k, v]) => `${snake(k)}=${v}`).join(", ")}`);
  return c.json({ ok: true });
});

app.delete("/api/admin/:table/:id", async (c) => {
  const t = c.req.param("table");
  const id = c.req.param("id");
  if (!isTable(t) || !DELETABLE.includes(t)) return c.json({ error: "Not allowed" }, 400);
  const table = TABLES[t] as any;
  if (t === "students") {
    // Also remove the student's synced study data. (The Netlify Identity login itself must be removed in the Netlify UI.)
    const [st] = await db.select({ identityId: students.identityId }).from(students).where(eq(students.id, id));
    if (st) await db.delete(userData).where(eq(userData.identityId, st.identityId));
  }
  await db.delete(table).where(eq(table.id, id));
  await log(c.get("user").email, `Deleted from ${t}`);
  return c.json({ ok: true });
});

app.put("/api/admin/settings/:key", async (c) => {
  const key = c.req.param("key");
  if (key !== "exam") return c.json({ error: "Unknown setting" }, 400);
  const body = await c.req.json().catch(() => ({}));
  const value = { title: clean(body.title, 120) || "Upcoming Exams", date: clean(body.date, 20) };
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  await log(c.get("user").email, `Exam date set: ${value.date}`);
  return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Something went wrong. Please try again." }, 500);
});

export const config = { path: "/api/*" };

export default app;
