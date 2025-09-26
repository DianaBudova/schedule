// index.js
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import supabase from './supabaseClient.js'; // клієнт для frontend-like операцій (anon key), якщо вже є
import { getSchedule, saveSchedule, deleteSchedule } from "./scheduleRepo.js";

// ---------- Настроювання сервера ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// ---------- Supabase server client (service role) ----------
// Використовуємо service role key для перевірки JWT та серверних операцій.
// У Render/Env має бути встановлено SUPABASE_SERVICE_ROLE_KEY (service_role key)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Auth middleware will not work properly.");
}
const supabaseServer = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ----- Time / week helpers (як у тебе було) -----
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

// ---------- Auth middleware (верифікація JWT через Supabase) ----------
app.use(async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }
    const token = authHeader.split(' ')[1];

    // Викликаємо getUser — повертає user або помилку
    const { data, error } = await supabaseServer.auth.getUser(token);
    if (error) {
      console.error("supabase auth.getUser error:", error);
      req.user = null;
    } else {
      // data.user може бути undefined у деяких варіантах — перевіряємо
      const user = data?.user ?? data;
      req.user = user ? { id: user.id, email: user.email } : null;
    }
    next();
  } catch (err) {
    console.error("Auth middleware unexpected error:", err);
    req.user = null;
    next();
  }
});

// ---------- Auth routes (опціонально) ----------
// Примітка: реєстрацію/вхід краще робити на фронтенді через anon key.
// Але тут лишу приклади, якщо хочеш робити це через сервер:
app.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    // Використовуємо frontend-like client (anon key), який ти імпортував як 'supabase'
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
    // data.session.access_token — віддаємо клієнту щоб він зберігав і надсилав в Authorization
    return res.json({ session: data.session, user: data.user });
  } catch (err) {
    console.error("POST /login error:", err);
    res.status(500).json({ error: 'Internal Server Error' });
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

app.get("/auth", (req, res) => {
  // Показує сторінку логіна/реєстрації
  res.render("auth", {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_KEY
  });
});

app.get("/", async (req, res) => {
  try {
    // Для публічного перегляду можеш дозволити неавторизованим користувачам,
    // але для роботи з індивідуальними schedules — обов'язкова авторизація
    if (!ensureAuth(req, res)) return;

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
