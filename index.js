import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
const port = 3000;

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "permalist",
  password: "",
  port: 5432
})

db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

let items = [
  { id: 1, title: "Buy milk" },
  { id: 2, title: "Finish homework" },
];
let users = [];

function formatDate(date) {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + 1); //because automatic change of time 
  // zone while retriving a date from the database
  return newDate.toLocaleDateString('sv-SE', { timeZone: 'UTC' });
}

function setFirstWeekDay(today) {
  var difference = today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1);
  return new Date(today.setDate(difference));
}

function setLastWeekDay(today) {
  var difference = today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1) + 6;
  return new Date(today.setDate(difference));
}

function setFirstMonthDay(today) {
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

function setLastMonthDay(today) {
  return new Date(today.getFullYear(), today.getMonth() + 1, 0);
}

let currentUserId = 1;

app.get("/", async (req, res) => {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'UTC' });
  try {
    const result = await db.query(`
      SELECT 
        items.id,
        items.title,
        items.date,
        items.user_id,
        users.name AS user_name
      FROM items
      LEFT JOIN users ON items.user_id = users.id
      ORDER BY items.date ASC
    `);
    const items = result.rows.map((item) => {
      item.date = formatDate(item.date);
      return item;
    });
    const userResult = await db.query("SELECT * FROM users");
    const allUsers = userResult.rows;
    res.render("index.ejs", {
      listTitle: "To-do-list",
      listItems: items,
      currentDate: today,
      selectedPeriod: null,
      users: allUsers,
      userName: null,
      currentUserId: null
    });
  } catch (err) {
    console.log(err);
  }
});

app.post("/addUser", (req, res) => {
  if (req.body.add === "new") {
    return res.redirect("/new");
  }
  res.redirect("/");
});

app.get("/new", (req, res) => {
  res.render("new.ejs", {
    error: null,
    previousName: ""
  });
});

app.post("/new", async (req, res) => {
  console.log(req.body);

  const newName = req.body.name;
  console.log("Trying to add new user with name:", newName);

  if (!newName) {
    console.log("Name is required.");
    return res.render("new.ejs",
      {
        error: "Name is required.",
        previousName: ""
      }
    );
  }

  try {
    const existingUser = await db.query("SELECT * FROM users WHERE name = $1", [newName]);

    if (existingUser.rows.length > 0) {
      console.log("User already exists.");
      return res.render("new.ejs",
        {
          error: "A user with this name already exists.",
          previousName: newName
        });
    }

    const result = await db.query(
      "INSERT INTO users (name) VALUES($1) RETURNING *;", [newName]
    );
    console.log("User added to DB:", result.rows);

    return res.redirect("/");
  } catch (err) {
    console.error("Error during insertion:", err);
    return res.render("new.ejs",
      {
        error: "Database error occurred.",
        previousName: newName
      });
  }
});

app.get("/user/:name/:id", async (req, res) => {
  const userResult = await db.query("SELECT * FROM users");
  const users = userResult.rows;

  const userName = req.params.name;
  const currentUserId = parseInt(req.params.id);


  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'UTC' });
  try {
    const selectedUser = users.find(user => user.id === currentUserId);
    console.log(selectedUser);
    if (!selectedUser) {
      console.error("User not found!");
      res.render("/", { error: "User not found." });
      return;
    }

    const result = await db.query(`
      SELECT 
        items.id      AS item_id,
        items.title,
        items.date,
        users.id      AS user_id,
        users.name    
      FROM items
      JOIN users ON items.user_id = users.id
      WHERE items.user_id = $1
      ORDER BY items.date ASC
    `, [currentUserId]);

    const items = result.rows.map((item) => {
      item.date = formatDate(item.date);
      return item;
    });
    res.render("index.ejs", {
      listTitle: `${selectedUser.name}'s to-do-list`,
      listItems: items,
      currentDate: today,
      selectedPeriod: null,
      users: users,
      userName: selectedUser.name,
      currentUserId: selectedUser.id
    });
  } catch (err) {
    console.error(err);
    res.render("/", { error: "Database error occurred." });
  }
})

app.post("/timeSlot", async (req, res) => {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'UTC' });
  const todayWithoutSettingLocalTime = new Date();
  const selectedPeriod = req.body.timeSlot;
  const userId = parseInt(req.body.userId);
  const userResult = await db.query("SELECT * FROM users");
  const allUsers = userResult.rows;
  const selectedUser = allUsers.find((user) => user.id === userId)

  try {
    let result = "";
    let items = "";
    let startDay = "";
    let lastDay = "";
    if (selectedPeriod) {
      switch (selectedPeriod) {
        case 'today':
          if (userId) {
            result = await db.query("SELECT * FROM items WHERE date = $1 AND user_id = $2 ORDER BY date ASC", [today, userId]);
          } else {
            result = await db.query("SELECT items.*, users.name AS user_name FROM items LEFT JOIN users ON items.user_id = users.id WHERE date = $1  ORDER BY date ASC", [today]);
          }
          items = result.rows.map((item) => {
            item.date = formatDate(item.date);
            return item;
          });
          break;
        case 'current week':
          startDay = setFirstWeekDay(todayWithoutSettingLocalTime);
          lastDay = setLastWeekDay(todayWithoutSettingLocalTime);
          if (userId) {
            result = await db.query("SELECT * FROM items WHERE user_id = ($1) AND date BETWEEN ($2) AND ($3) ORDER BY date ASC", [userId, startDay, lastDay]);
          } else {
            result = await db.query("SELECT items.*, users.name AS user_name FROM items LEFT JOIN users ON items.user_id = users.id WHERE date BETWEEN ($1) AND ($2) ORDER BY date ASC", [startDay, lastDay]);
          }
          items = result.rows.map((item) => {
            item.date = formatDate(item.date);
            return item;
          });
          break;
        case 'current month':
          startDay = setFirstMonthDay(todayWithoutSettingLocalTime);
          lastDay = setLastMonthDay(todayWithoutSettingLocalTime);
          if(userId){
            result = await db.query("SELECT * FROM items WHERE user_id = ($1) AND date BETWEEN ($2) AND ($3) ORDER BY date ASC", [userId, startDay, lastDay]);
          } else{
            result = await db.query("SELECT items.*, users.name AS user_name FROM items LEFT JOIN users ON items.user_id = users.id WHERE date BETWEEN ($1) AND ($2) ORDER BY date ASC", [startDay, lastDay]);
          }
          items = result.rows.map((item) => {
            item.date = formatDate(item.date);
            return item;
          });
          break;
        default:
          return res.send("Incorrect choice.");
      }
      return res.render("index.ejs", {
        listTitle: "To-do-list",
        listItems: items,
        currentDate: today,
        selectedPeriod: selectedPeriod,
        users: allUsers,
        userName: selectedUser ? selectedUser.name : null,
        currentUserId: selectedUser ? selectedUser.id : null
      });
    }
    return res.redirect("/");
  } catch (err) {
    console.log(err);
    res.status(500).send("Error retrieving data.");
  }
})

app.post("/add", async (req, res) => {
  const item = req.body.newItem;
  const date = req.body.date;
  const userId = req.body.userId;
  items.push({ title: item, date: date });
  try {
    if (userId) {
      await db.query("INSERT INTO items (title, date, user_id) VALUES ($1, $2, $3)", [item, date, userId]);
    } else {
      await db.query("INSERT INTO items (title, date) VALUES ($1, $2)", [item, date]);
    }
    res.redirect("/");
  } catch (err) {
    console.log(err);
  }
});

app.post("/edit", async (req, res) => {
  const updatedItem = req.body.updatedItemTitle;
  const idItem = req.body.updatedItemId;
  const userId = req.body.userId;

  console.log("updatedItemId:", idItem);
  console.log("titleUpdatedItem:", updatedItem);
  try {
    if(userId){
      await db.query("UPDATE items SET title = ($1) WHERE id = ($2) AND user_id = ($3)", 
        [updatedItem, idItem, userId]);
    } else{
      await db.query("UPDATE items SET title = ($1) WHERE id = ($2)", 
        [updatedItem, idItem]);
    }
    res.redirect("/");
  } catch (err) {
    console.log(err);
  }
});

app.post("/delete", async (req, res) => {
  const deletedItem = req.body.deleteItemId;
  const userId = req.body.userId;

  console.log("deleteItemId:", deletedItem);
  console.log("userId:", userId);

  try {
    await db.query("DELETE FROM items WHERE id = $1", [deletedItem]);

    if (userId) {
      await db.query("DELETE FROM items WHERE id = ($1) AND user_id = ($2)", [deletedItem, userId]);
    }

    res.redirect("/");

  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).send("Internal server error");
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
