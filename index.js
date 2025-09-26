// index.js
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { getSchedule, saveSchedule, deleteSchedule } from "./scheduleRepo.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

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
app.set("views", path.join(__dirname, "views")); // якщо ejs в папці views
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ----- Simple middleware для user (тестова реалізація) -----
// У production: отримуй userId з сесії / JWT / Supabase Auth
app.use((req, res, next) => {
  req.user = { id: req.header('x-user-id') || 'demo-user' };
  next();
});

// ----- Routes -----
app.get("/", async (req, res) => {
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
    const userId = req.user.id;
    const schedule = await getSchedule(userId);
    schedule.courses = schedule.courses ?? [];

    const newCourse = {
      // генеруємо унікальний id як число
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

    // Перевірка конфлікту по week, weekday, time
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
    const userId = req.user.id;
    const schedule = await getSchedule(userId);
    schedule.courses = schedule.courses ?? [];

    const id = Number(req.body.id);
    const idx = schedule.courses.findIndex(c => Number(c.id) === id);

    if (idx === -1) {
      // курс не знайдено
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

    // заміна в масиві
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

// Optional: API endpoints for frontend JS (JSON)
app.get("/api/schedule", async (req, res) => {
  try {
    const userId = req.user.id;
    const schedule = await getSchedule(userId);
    res.json(schedule ?? { courses: [] });
  } catch (err) {
    console.error("Error on GET /api/schedule :", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`App is listening on port ${port}`);
});
