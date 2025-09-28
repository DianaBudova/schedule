// index.js
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import cookieParser from "cookie-parser";

import supabase from './supabaseClient.js'; // frontend-like client (anon key)
import { getSchedule, saveSchedule, deleteSchedule } from "./scheduleRepo.js";

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// ---------- Настроювання сервера ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

// ---------- Supabase server client (service role) ----------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.");
}
const supabaseServer = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------- Time helpers ----------
const startingDate = "2025-09-01";
const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const startingDay = new Date(startingDate);
function computeWeekInfo() {
  const currentDate = new Date();
  const currentWeek = Math.floor((currentDate - startingDay) / 604800000) + 1;
  const currentDay = weekdays[currentDate.getDay()];
  const lastDigit = Math.abs(currentWeek) % 10;
  return { currentDate, currentWeek, currentDay, lastDigit };
}

// ---------- Auth middleware ----------
app.use(async (req, res, next) => {
  try {
    // 1) Токен з Authorization header або cookie
    let token = null;
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) token = authHeader.split(' ')[1];
    if (!token && req.cookies.access_token) token = req.cookies.access_token;
    if (!token) {
      req.user = null;
      return next();
    }

    // 2) Перевіряємо токен у таблиці sessions
    const { data: sessionData, error } = await supabaseServer
      .from('sessions')
      .select('user_id, expires_at')
      .eq('token', token)
      .single();

    if (error || !sessionData) {
      req.user = null;
      return next();
    }

    const now = new Date();
    if (sessionData.expires_at && new Date(sessionData.expires_at) < now) {
      // видаляємо прострочену сесію
      await supabaseServer.from('sessions').delete().eq('token', token);
      req.user = null;
      return next();
    }

    // 3) Отримуємо користувача з auth.users
    const { data: userData, error: userError } = await supabaseServer
      .from('users') // або 'auth.users' якщо потрібно
      .select('id, email')
      .eq('id', sessionData.user_id)
      .single();

    req.user = userData && !userError ? { id: userData.id, email: userData.email } : null;

    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    req.user = null;
    next();
  }
});

// ---------- Auth routes ----------
app.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ user: data.user ?? data });
  } catch (err) {
    console.error("POST /register error:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(400).json({ error: error.message });

    const user = data.user;
    if (!user) return res.status(400).json({ error: "User not found" });

    // Генеруємо сесію в БД
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 години
    await supabaseServer.from('sessions').insert({
      token,
      user_id: user.id,
      expires_at: expiresAt
    });

    // Відправляємо токен як cookie
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 // 24 години
    });

    return res.json({ user, token });
  } catch (err) {
    console.error("POST /login error:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/logout', async (req, res) => {
  try {
    const token = req.cookies.access_token;
    if (token) {
      await supabaseServer.from('sessions').delete().eq('token', token);
    }
    res.clearCookie('access_token');
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /logout error:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------- Routes helpers ----------
function ensureAuth(req, res) {
  if (!req.user || !req.user.id) {
    res.status(401).send('Unauthorized');
    return false;
  }
  return true;
}

function requireAuth(req, res, next) {
  if (req.user && req.user.id) return next();
  return res.redirect('/auth');
}

// ---------- Pages ----------
app.get("/auth", (req, res) => {
  res.render("auth", {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_KEY
  });
});

app.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const schedule = await getSchedule(userId);
    const courses = schedule?.courses ?? [];
    const { currentDate, currentWeek, currentDay, lastDigit } = computeWeekInfo();

    res.render("index.ejs", {
      courses,
      currentWeek,
      lastDigit,
      startingDate,
      currentDate,
      currentDay
    });
  } catch (err) {
    console.error("Error on GET / :", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/edit", async (req, res) => {
  try {
    if (!ensureAuth(req, res)) return;
    const userId = req.user.id;
    const schedule = await getSchedule(userId);
    const courses = schedule?.courses ?? [];
    res.render("create.ejs", { courses });
  } catch (err) {
    console.error("Error on GET /edit :", err);
    res.status(500).send("Internal Server Error");
  }
});

// ---------- CRUD routes ----------
app.post("/create", async (req, res) => {
  if (!ensureAuth(req, res)) return;
  const userId = req.user.id;
  const schedule = await getSchedule(userId) || { courses: [] };

  const newCourse = {
    id: Date.now(),
    name: req.body.courseName || "",
    type: req.body.type || "",
    cabinet: req.body.cabinet || "",
    professor: req.body.professor || "",
    weekday: req.body.weekday || "",
    week: req.body.week || "",
    time: req.body.time || "",
    classroom: req.body.classroom || "",
    students: req.body.students || "",
    currentMarks: req.body.currentMarks || "",
    works: req.body.works || "",
    other: req.body.other || ""
  };

  const found = schedule.courses.find(c =>
    String(c.week) === String(newCourse.week) &&
    c.time === newCourse.time &&
    c.weekday === newCourse.weekday
  );

  if (found) return res.render("create.ejs", { foundExistingCourse: "Course already exists", courses: schedule.courses });

  schedule.courses.push(newCourse);
  await saveSchedule(userId, schedule);
  res.redirect("/edit");
});

app.post("/update", async (req, res) => {
  if (!ensureAuth(req, res)) return;
  const userId = req.user.id;
  const schedule = await getSchedule(userId) || { courses: [] };
  const id = Number(req.body.id);
  const idx = schedule.courses.findIndex(c => Number(c.id) === id);
  if (idx === -1) return res.redirect("/edit");

  schedule.courses[idx] = {
    id,
    name: req.body.courseName || "",
    type: req.body.type || "",
    cabinet: req.body.cabinet || "",
    professor: req.body.professor || "",
    weekday: req.body.weekday || "",
    week: req.body.week || "",
    time: req.body.time || "",
    classroom: req.body.classroom || "",
    students: req.body.students || "",
    currentMarks: req.body.currentMarks || "",
    works: req.body.works || "",
    other: req.body.other || ""
  };

  await saveSchedule(userId, schedule);
  res.redirect("/edit");
});

app.post("/delete", async (req, res) => {
  if (!ensureAuth(req, res)) return;
  const userId = req.user.id;
  const idDelete = Number(req.body.idDelete);
  const schedule = await getSchedule(userId) || { courses: [] };
  schedule.courses = schedule.courses.filter(c => Number(c.id) !== idDelete);
  await saveSchedule(userId, schedule);
  res.redirect("/edit");
});

// API endpoint
app.get("/api/schedule", async (req, res) => {
  if (!ensureAuth(req, res)) return;
  const userId = req.user.id;
  const schedule = await getSchedule(userId);
  res.json(schedule ?? { courses: [] });
});

// ---------- Start ----------
app.listen(port, () => {
  console.log(`App is listening on port ${port}`);
});
