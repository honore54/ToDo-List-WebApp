import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import path from "path";
import session from "express-session";
import moment from "moment";
import nodemailer from "nodemailer";
import cron from "node-cron";
const app = express();
const PORT = 9000;
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: false,
  })
);
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.username = req.session.username;
  res.locals.notificationCount = 0;
  next();
});

function sendEmailReminder(userEmail, tasks) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "honoremugisha54@gmail.com",
      pass: "honore 250",
    },
  });

  const mailOptions = {
    from: "honoremugisha54@gmail.com",
    to: userEmail,
    subject: "Task Reminder",
    text: `You have the following tasks not completed:\n\n${tasks.join("\n")}`,
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log("Error sending email:", error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
}

cron.schedule("*/20 * * * *", async () => {
  console.log("Running reminders at scheduled time");
  const userId = req.session.userId;
  const userEmail = req.session.email;

  await checkAndSendReminders(req, res, userId, userEmail);

  const notificationCount = res.locals.notificationCount;

  res.status(200).json({ message: "Reminders sent", notificationCount });
});

async function checkAndSendReminders(req, res, userId, userEmail) {
  try {
    if (!req.session.username) {
      return;
    }
    const user = await UserModel.findById(userId);
    if (!user) {
      return;
    }

    const todos = await TodoModel.find({
      userId,
      completed: false,
      reminderSent: false,
    });
    if (todos.length > 0) {
      const tasks = todos.map((todo) => todo.task);
      sendEmailReminder(userEmail, tasks);
      await TodoModel.updateMany(
        { userId, completed: false, reminderSent: false },
        { reminderSent: true }
      );

      const notificationCount = todos.length;
      res.locals.notificationCount = notificationCount;
    }
  } catch (err) {
    console.log(err);
  }
}

app.get("/reminders", async (req, res) => {
  try {
    if (!req.session.username) {
      return res.redirect("/login");
    }

    const userId = req.session.userId;
    const userEmail = req.session.email;

    await checkAndSendReminders(userId, userEmail);

    const notificationCount = res.locals.notificationCount;
    res.render("task", {
      username: req.session.username,
      notificationCount,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const connection = async () => {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/TodoAppUsers");
    console.log("Connected to MongoDB");
  } catch (err) {
    console.log(err);
  }
};
const UserSchema = new mongoose.Schema({
  usernames: String,
  email: String,
  password: String,
});
const UserModel = mongoose.model("UserAccount", UserSchema);
app.get("/", (req, res) => {
  res.render("landing");
});
app.get("/index", (req, res) => {
  res.render("index");
});

app.post("/addUser", async (req, res) => {
  try {
    const { usernames, email, password } = req.body;
    const existingUser = await UserModel.findOne({
      $or: [{ usernames }, { email }],
    });
    if (existingUser) {
      res.send(
        "<script>alert('User already exists in the system!');window.location='/index'</script>"
      );
      return;
    }
    var Complexity = await bcrypt.genSalt(10);
    var HashedPassword = await bcrypt.hash(password, Complexity);
    const newUser = new UserModel({
      usernames,
      email,
      password: HashedPassword,
    });
    await newUser.save();
    res.send(
      "<script>alert('You are now in the system!');window.location='/login'</script>"
    );
  } catch (err) {
    console.log(err);
  }
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/task", async (req, res) => {
  try {
    if (!req.session.username) {
      return res.redirect("/login");
    }
    const username = req.session.username;
    const email = req.session.email;
    const userId = req.session.userId;
    const todos = await TodoModel.find({
      userId,
      completed: { $exists: false },
    });
    const priorityNotCompleted = await TodoModel.find({
      userId,
      completed: { $exists: false },
    });
    const complete = await TodoModel.find({
      userId,
      completed: { $exists: true },
    });
    const allTaskCount = todos.length || 0;
    const completedCount =
      complete.filter((todo) => todo.completed).length || 0;
    const highPriority =
      priorityNotCompleted.filter((todo) => todo.priority === "high").length ||
      0;
    const lowPriority =
      priorityNotCompleted.filter((todo) => todo.priority === "low").length ||
      0;
    const PriorityCount =
      priorityNotCompleted.filter((todo) => todo.priority).length || 0;
    res.render("task", {
      username,
      email,
      todos,
      complete,
      priorityNotCompleted,
      allTaskCount,
      completedCount,
      highPriority,
      lowPriority,
      PriorityCount,
      userId,
    });
  } catch (err) {
    console.log(err);
  }
});

app.get("/home", async (req, res) => {
  try {
    if (!req.session.username) {
      return res.redirect("/login");
    }
    const username = req.session.username;
    res.render("home", { username });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    var userData = await UserModel.findOne({ email });
    if (userData && (await bcrypt.compare(password, userData.password))) {
      req.session.username = userData.usernames;
      req.session.email = userData.email;
      req.session.userId = userData._id;
      res.send(
        "<script>alert('Nice its you!');window.location='/home'</script>"
      );
    } else {
      res.send("<script>alert('Invalid email or password')</script>");
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const todoSchema = new mongoose.Schema({
  task: String,
  priority: String,
  dueDate: Date,
  completed: Boolean,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "UserAccount" },
  reminderSent: { type: Boolean, default: false },
});
const TodoModel = mongoose.model("Todo", todoSchema);
app.post("/addtask", function (req, res) {
  const { task, priority, dueDate } = req.body;
  const userId = req.session.userId;

  if (new Date(dueDate) < new Date().setHours(0, 0, 0, 0)) {
    return res.redirect("/task");
  }

  const todo = new TodoModel({ task, priority, dueDate, userId });
  todo
    .save()
    .then(() => {
      res.redirect("/task");
    })
    .catch((err) => {
      console.error(err);
      res.status(500).send("Error adding todo");
    });
});

app.post("/update", async (req, res) => {
  try {
    const { id, task, userId } = req.body;
    const updatedTask = await TodoModel.findOneAndUpdate(
      { _id: id, userId },
      { task },
      { new: true }
    );
    if (!updatedTask) {
      return res.status(404).send("Task not found or unauthorized to edit.");
    }
    res.sendStatus(200);
  } catch (err) {
    console.log(err);
    res.status(500).send("Internal Server Error");
  }
});
app.post("/complete", async (req, res) => {
  const { id } = req.body;
  const userId = req.session.userId;
  try {
    const todo = await TodoModel.findOne({ _id: id, userId });
    if (!todo) {
      return res.status(404).send("Todo not found");
    }
    await TodoModel.findByIdAndUpdate(id, { completed: true });
    res.send("Todo marked as completed");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error marking todo as completed");
  }
});

app.post("/remove", async (req, res) => {
  const { id } = req.body;
  const userId = req.session.userId;
  try {
    const todo = await TodoModel.findOne({ _id: id, userId });
    if (!todo) {
      return res.status(404).send("Todo not found");
    }
    await TodoModel.findByIdAndDelete(id);
    res.send("Todo removed");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error removing todo");
  }
});

app.get("/alltask", async (req, res) => {
  try {
    if (!req.session.username) {
      return res.redirect("/login");
    }
    const username = req.session.username;
    const email = req.session.email;
    const userId = req.session.userId;
    const todos = await TodoModel.find({
      userId,
      completed: { $exists: false },
    });
    const complete = await TodoModel.find({
      userId,
      completed: { $exists: true },
    });
    const priorityNotCompleted = await TodoModel.find({
      userId,
      completed: { $exists: false },
    });
    const allTaskCount = todos.length || 0;
    const completedCount =
      complete.filter((todo) => todo.completed).length || 0;
    const highPriority =
      priorityNotCompleted.filter((todo) => todo.priority === "high").length ||
      0;
    const lowPriority =
      priorityNotCompleted.filter((todo) => todo.priority === "low").length ||
      0;
    const PriorityCount =
      priorityNotCompleted.filter((todo) => todo.priority).length || 0;

    res.render("alltask", {
      username,
      email,
      todos,
      complete,
      priorityNotCompleted,
      allTaskCount,
      completedCount,
      highPriority,
      lowPriority,
      PriorityCount,
      userId,
    });
  } catch (err) {
    console.log(err);
  }
});

app.get("/completed", async (req, res) => {
  try {
    if (!req.session.username) {
      return res.redirect("/login");
    }
    const username = req.session.username;
    const email = req.session.email;
    const userId = req.session.userId;
    const todos = await TodoModel.find({
      userId,
      completed: { $exists: false },
    });
    const report = await TodoModel.find({
      userId,
      completed: { $exists: true },
    });
    const complete = await TodoModel.find({
      userId,
      completed: { $exists: true },
    });
    const priorityNotCompleted = await TodoModel.find({
      userId,
      completed: { $exists: false },
    });
    const allTaskCount = todos.length || 0;
    const completedCount =
      complete.filter((todo) => todo.completed).length || 0;
    const highPriority =
      priorityNotCompleted.filter((todo) => todo.priority === "high").length ||
      0;
    const lowPriority =
      priorityNotCompleted.filter((todo) => todo.priority === "low").length ||
      0;
    const completed = report;
    const PriorityCount =
      priorityNotCompleted.filter((todo) => todo.priority).length || 0;
    res.render("completed", {
      username,
      email,
      todos,
      report,
      complete,
      priorityNotCompleted,
      allTaskCount,
      completedCount,
      highPriority,
      lowPriority,
      completed,
      PriorityCount,
      userId,
    });
  } catch (err) {
    console.log(err);
  }
});
app.get("/priority", async (req, res) => {
  try {
    if (!req.session.username) {
      return res.redirect("/login");
    }
    const username = req.session.username;
    const email = req.session.email;
    const userId = req.session.userId;
    const todos = await TodoModel.find({
      userId,
      completed: { $exists: false },
      priority: { $exists: true },
    });
    const complete = await TodoModel.find({
      userId,
      completed: { $exists: true },
    });
    const priorityNotCompleted = await TodoModel.find({
      userId,
      completed: { $exists: false },
    });
    const allTaskCount = todos.length || 0;
    const completedCount =
      complete.filter((todo) => todo.completed).length || 0;
    const highPriority =
      priorityNotCompleted.filter((todo) => todo.priority === "high").length ||
      0;
    const lowPriority =
      priorityNotCompleted.filter((todo) => todo.priority === "low").length ||
      0;
    const priorityTodos = priorityNotCompleted;
    const PriorityCount =
      priorityNotCompleted.filter((todo) => todo.priority).length || 0;
    res.render("priority", {
      username,
      email,
      todos,
      complete,
      priorityNotCompleted,
      allTaskCount,
      completedCount,
      highPriority,
      lowPriority,
      priorityTodos,
      PriorityCount,
      userId,
    });
  } catch (err) {
    console.log(err);
  }
});

app.get("/calendar", async (req, res) => {
  try {
    if (!req.session.username) {
      return res.redirect("/login");
    }

    const userId = req.session.userId;
    const todos = await TodoModel.find({ userId });

    const events = todos.map((todo) => ({
      title: todo.task,
      start: moment(todo.dueDate).toISOString(),
    }));
    console.log(events);

    res.render("calendar", { username: req.session.username, events });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error logging out");
    } else {
      res.redirect("/login");
    }
  });
});

app.listen(PORT, (err) => {
  if (!err) {
    console.log(`Server is running on port: ${PORT}`);
  } else {
    console.log("Somethin went wrong!");
  }
});

connection();
