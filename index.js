// index.js
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import supabase from './supabaseClient.js'; // frontend-like client (anon key)
import { getSchedule, saveSchedule, deleteSchedule } from "./scheduleRepo.js";

// ---------- Настроювання сервера ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// ---------- Supabase server client (service role) ----------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Auth middleware will not work properly.");
}
const supabaseServer = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ----- Time / week helpers -----
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

// ----- Express setup -----
app.set("views", path.join(__dirname, "views")); // ejs в папці views
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser()); // <-- додано

// ---------- Auth middleware (враховує header або cookie) ----------
app.use(async (req, res, next) => {
  try {
    // 1) перевіряємо Authorization header
    const authHeader = req.headers['authorization'] || '';
    let token = null;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // 2) якщо header відсутній — дивимось cookie (назва 'access_token')
    if (!token && req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) {
      req.user = null;
      return next();
    }

    // Викликаємо getUser з access token
    // supabaseServer.auth.getUser(token) повертає { data, error }
    const response = await supabaseServer.auth.getUser(token);
    const { data, error } = response;
    if (error) {
      // Якщо токен прострочений або неправильний — видаляємо cookie (чистимо)
      console.warn("supabase auth.getUser returned error:", error.message || error);
      // очистити cookie (необов'язково)
      res.clearCookie('access_token');
      req.user = null;
      return next();
    }

    const user = data?.user ?? data;
    if (user && user.id) {
      req.user = { id: user.id, email: user.email ?? null };
    } else {
      req.user = null;
    }

    next();
  } catch (err) {
    console.error("Auth middleware unexpected error:", err);
    // у випадку internal error — не авторизуємо
    req.user = null;
    next();
  }
});

// ---------- Auth routes ----------
app.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return res.status(400).json({ error: error.message || error });
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
    if (error) return res.status(400).json({ error: error.message || error });

    // data.session.access_token — зберігаємо в secure, httpOnly cookie
    const accessToken = data?.session?.access_token;
    const refreshToken = data?.session?.refresh_token;
    const expiresAt = data?.session?.expires_at; // unix timestamp seconds (може бути undefined)

    if (!accessToken) {
      // несподівано — теж повертаємо сесію, але без cookie
      return res.json({ session: data.session, user: data.user });
    }

    // Обчислимо maxAge для cookie, якщо expires_at заданий
    let maxAge = undefined;
    if (expiresAt && Number(expiresAt) > 0) {
      const ms = (Number(expiresAt) * 1000) - Date.now();
      if (ms > 0) maxAge = ms;
    }

    // Налаштування cookie
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge // якщо undefined — браузер буде сесійним cookie
    });

    // опційно: зберегти refresh token (якщо хочеш робити refresh на сервері)
    if (refreshToken) {
      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        // не ставимо maxAge тут окремо
      });
    }

    return res.json({ session: data.session, user: data.user });
  } catch (err) {
    console.error("POST /login error:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Logout очистить cookie
app.post('/logout', (req, res) => {
  try {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    // Якщо хочеш — також викликати supabase.auth.signOut() з anon client
    return res.json({ ok: true });
  } catch (err) {
    console.error("POST /logout error:", err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------- Routes (захищені) ----------
function ensureAuth(req, res) {
  if (!req.user || !req.user.id) {
    res.status(401).send('Unauthorized');
    return false;
  }
  return true;
}

function requireAuth(req, res, next) {
  if (req.user && req.user.id) {
    return next();
  }

  const acceptsJson = req.headers['accept'] && req.headers['accept'].includes('application/json');
  const isXhr = req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest';

  if (acceptsJson || isXhr || req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.redirect('/auth');
}

app.get("/auth", (req, res) => {
  res.render("auth", {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY
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

// create / update / delete — як у тебе було
app.post("/create", async (req, res) => {
  try {
    if (!ensureAuth(req, res)) return;
    const userId = req.user.id;
    const schedule = await getSchedule(userId);
    schedule.courses = schedule.courses ?? [];

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

    const foundExistingCourse = schedule.courses.find(c =>
      String(c.week) === String(newCourse.week) &&
      c.time === newCourse.time &&
      c.weekday === newCourse.weekday
    );

    if (foundExistingCourse) {
      return res.render("create.ejs", {
        foundExistingCourse: "You have already registered another course on the exact same time, week and day",
        courses: schedule.courses
      });
    }

    schedule.courses.push(newCourse);
    await saveSchedule(userId, schedule);

    res.redirect("/edit");
  } catch (err) {
    console.error("Error on POST /create :", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/update", async (req, res) => {
  try {
    if (!ensureAuth(req, res)) return;
    const userId = req.user.id;
    const schedule = await getSchedule(userId);
    schedule.courses = schedule.courses ?? [];

    const id = Number(req.body.id);
    const idx = schedule.courses.findIndex(c => Number(c.id) === id);

    if (idx === -1) {
      return res.redirect("/edit");
    }

    const updatedCourse = {
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

    schedule.courses[idx] = updatedCourse;
    await saveSchedule(userId, schedule);

    res.redirect("/edit");
  } catch (err) {
    console.error("Error on POST /update :", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/delete", async (req, res) => {
  try {
    if (!ensureAuth(req, res)) return;
    const userId = req.user.id;
    const idDelete = Number(req.body.idDelete);
    const schedule = await getSchedule(userId);
    schedule.courses = (schedule.courses ?? []).filter(c => Number(c.id) !== idDelete);
    await saveSchedule(userId, schedule);
    res.redirect("/edit");
  } catch (err) {
    console.error("Error on POST /delete :", err);
    res.status(500).send("Internal Server Error");
  }
});

// API endpoint
app.get("/api/schedule", async (req, res) => {
  try {
    if (!ensureAuth(req, res)) return;
    const userId = req.user.id;
    const schedule = await getSchedule(userId);
    res.json(schedule ?? { courses: [] });
  } catch (err) {
    console.error("Error on GET /api/schedule :", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------- Start ----------
app.listen(port, () => {
  console.log(`App is listening on port ${port}`);
});
