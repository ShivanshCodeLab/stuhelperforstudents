import { pgTable, uuid, text, timestamp, boolean, integer, date, jsonb } from "drizzle-orm/pg-core";

// Student profiles, linked to a Netlify Identity account by identity_id.
export const students = pgTable("students", {
  id: uuid().primaryKey().defaultRandom(),
  identityId: text("identity_id").notNull().unique(),
  fullName: text("full_name").notNull(),
  rollNo: text("roll_no"),
  course: text(),
  semester: text(),
  email: text().notNull().unique(),
  phone: text().unique(),
  status: text().notNull().default("Active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const libraryBooks = pgTable("library_books", {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  author: text(),
  semester: text().default("All Semesters"),
  resourceUrl: text("resource_url"),
  fileName: text("file_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookRequests = pgTable("book_requests", {
  id: uuid().primaryKey().defaultRandom(),
  studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
  studentName: text("student_name").notNull(),
  rollNo: text("roll_no"),
  semester: text(),
  title: text().notNull(),
  reqType: text("req_type").default("PDF"),
  details: text(),
  status: text().notNull().default("Pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notices = pgTable("notices", {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  body: text().notNull(),
  audience: text().default("All Semesters"),
  priority: text().default("Normal"),
  active: boolean().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assignments = pgTable("assignments", {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  subject: text(),
  due: date(),
  priority: text().default("Normal"),
  minutes: integer(),
  details: text(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const syllabus = pgTable("syllabus", {
  id: uuid().primaryKey().defaultRandom(),
  subject: text().notNull(),
  chapter: text().notNull(),
  priority: text().default("Medium"),
  target: date(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid().primaryKey().defaultRandom(),
  actor: text(),
  action: text(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
