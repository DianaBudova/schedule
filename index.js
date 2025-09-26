import bodyParser from "body-parser";
import express from "express";
import fs from "fs";

let courseId =0;
let course = {
  courses: [],
};

const startingDate="2025-09-01";
let weekdays=['Sunday','Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; 
let startingDay= new Date(startingDate);
let currentDate=new Date();
let currentWeek=Math.floor((currentDate- startingDay)/604800000)+1;
let currentDay= weekdays[currentDate.getDay()];
const lastDigit = Math.abs(currentWeek) % 10; 


const app = express();
const port = 3000;

try {
  if (fs.existsSync("courses.json")) {
    const data = fs.readFileSync("courses.json", "utf8");
    course = JSON.parse(data);
    if (course.courses.length > 0) {
      courseId = Math.max(...course.courses.map(c => c.id)) + 1;
    }
  }
} catch (err) {
  console.error("Помилка при завантаженні даних:", err);
}

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.render("index.ejs", {courses: course.courses, currentWeek: currentWeek, lastDigit: lastDigit, startingDate: startingDate, currentDate: currentDate, currentDay: currentDay});
});

app.get("/edit", (req, res) => {
  res.render("create.ejs", {courses: course.courses});
});

app.post("/create", (req, res) => {
  const newCourse={id: courseId,
    name: req.body.courseName,
    type: req.body.type,
   cabinet:  req.body.cabinet,
   professor : req.body.professor,
   weekday : req.body.weekday,
   week : req.body.week,
   time : req.body.time,
   classroom : req.body.classroom,
   students : req.body.students,
   currentMarks : req.body.currentMarks,
   works : req.body.works,
   other : req.body.other,
  }
  const foundExistingCourse = course.courses.find(course =>
          parseInt(course.week) == parseInt(newCourse.week) &&
          course.time === newCourse.time &&
          course.weekday === newCourse.weekday
        );
        if(foundExistingCourse){
    res.render("create.ejs", {foundExistingCourse: "You have already registered another course on the exact same time, week and day", courses: course.courses});
    console.log("found one!!!!");
  }
  else if(!foundExistingCourse){
  course.courses.push(newCourse);
  writeToFile(course);
  courseId++;
  res.redirect("/edit");
  }
});

app.post("/update", (req,res)=>{
  let id= parseInt(req.body.id);
  const updatedCourse={id: id,
    name: req.body.courseName,
    type: req.body.type,
   cabinet:  req.body.cabinet,
   professor : req.body.professor,
   weekday : req.body.weekday,
   week : req.body.week,
   time : req.body.time,
   classroom : req.body.classroom,
   students : req.body.students,
   currentMarks : req.body.currentMarks,
   works : req.body.works,
   other : req.body.other,
  }
    course.courses.splice(id, 1, updatedCourse);
  writeToFile(course);
  res.redirect("/edit");
});

app.post("/delete", (req, res)=>{
  let idDelete= parseInt(req.body.idDelete);
  const index = course.courses.findIndex(theCourse => theCourse.id === idDelete);
    if (index !== -1) {
        course.courses.splice(index, 1);
    }
  writeToFile(course);
  res.redirect("/edit");
})

app.listen(port, () => {
  console.log("App is listening on port " + port);
});

function writeToFile(course){
    const json = JSON.stringify(course, null, 2);
    fs.writeFile("courses.json", json, (err) => {
        if (err) {
            console.error('Error writing file:', err);
            return;
        }
        console.log('File written successfully!');
    });
}
