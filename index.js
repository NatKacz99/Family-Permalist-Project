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

function formatDate(date){
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + 1); //because automatic change of time 
  // zone while retriving a date from the database
  return newDate.toLocaleDateString('sv-SE', { timeZone: 'UTC' }); 
}

function setFirstWeekDay(today){
  var difference = today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1);
  return new Date(today.setDate(difference));
}

function setLastWeekDay(today){
  var difference = today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1) + 1;
  return new Date(today.setDate(difference));
}

function setFirstMonthDay(today){
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

function setLastMonthDay(today){
  return new Date(today.getFullYear(), today.getMonth() + 1, 0);
}

app.get("/", async (req, res) => {
  try{
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'UTC' });

    const result = await db.query("SELECT * FROM items ORDER BY date ASC");
    const items = result.rows.map((item) => {
      item.date = formatDate(item.date);
      return item;
    });
    res.render("index.ejs", {
      listTitle: "To-do-list",
      listItems: items,
      currentDate: today,
      selectedPeriod: null
    });
} catch(err){
  console.log(err);
}
});

app.post("/timeSlot", async (req, res) => {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'UTC' });
  const todayWithoutSettingLocalTime = new Date();
  const selectedPeriod = req.body.timeSlot;

  try{
    let result = "";
    let items = "";
    let startDay = "";
    let lastDay = "";
      if(selectedPeriod){
        switch(selectedPeriod){
          case 'today':
            result = await db.query("SELECT * FROM items WHERE date = $1 ORDER BY date ASC", [today]);
            items = result.rows.map((item) => {
              item.date = formatDate(item.date);
              return item;
            });
            return res.render("index.ejs", {
              listTitle: "To-do-list",
              listItems: items,
              currentDate: today,
              selectedPeriod: selectedPeriod
            });
          case 'current week':
            startDay = setFirstWeekDay(todayWithoutSettingLocalTime);
            lastDay = setLastWeekDay(todayWithoutSettingLocalTime);
            result = await db.query("SELECT * FROM items WHERE date BETWEEN ($1) AND ($2) ORDER BY date ASC", [startDay, lastDay]);
            items = result.rows.map((item) => {
              item.date = formatDate(item.date);
              return item;
            });
            return res.render("index.ejs", {
              listTitle: "To-do-list",
              listItems: items,
              currentDate: today,
              selectedPeriod: selectedPeriod
            });
          case 'current month':
            startDay = setFirstMonthDay(todayWithoutSettingLocalTime);
            lastDay = setLastMonthDay(todayWithoutSettingLocalTime);
            result = await db.query("SELECT * FROM items WHERE date BETWEEN ($1) AND ($2) ORDER BY date ASC", [startDay, lastDay]);
            items = result.rows.map((item) => {
              item.date = formatDate(item.date);
              return item;
            });
            return res.render("index.ejs", {
              listTitle: "To-do-list",
              listItems: items,
              currentDate: today,
              selectedPeriod: selectedPeriod
            });
          default:
            return res.send("Incorrect choice.");
        }
    }
    res.redirect("/");
  } catch (err) {
      console.log(err);
      res.status(500).send("Error retrieving data.");
    }
})

app.post("/add", async (req, res) => {
  const item = req.body.newItem;
  const date = req.body.date;
  items.push({ title: item, date: date });
  try{
    await db.query("INSERT INTO items (title, date) VALUES ($1, $2)", [item, date]);
    res.redirect("/");
  } catch(err){ 
    console.log(err);
  }
});

app.post("/edit", async(req, res) => {
  const updatedItem = req.body.updatedItemTitle;
  const idItem = req.body.updatedItemId
  try{
    await db.query("UPDATE items SET title = ($1) WHERE id = ($2)", [updatedItem, idItem]);
    res.redirect("/");
  } catch(err){
    console.log(err);
  }
});

app.post("/delete", async (req, res) => {
  const deletedItem = req.body.deleteItemId;
  try{
    await db.query("DELETE FROM items WHERE id = $1", [deletedItem]);
    res.redirect("/");
  } catch(err){
    console.log(err);
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
