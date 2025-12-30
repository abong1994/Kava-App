const express = require("express");
const { nanoid } = require("nanoid");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

const app = express();
app.use(express.urlencoded({ extended: true }));

// Database
const adapter = new FileSync("db.json");
const db = low(adapter);
db.defaults({ farmers: [], batches: [] }).write();

// Home
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head><title>Kava Export App</title></head>
      <body style="font-family: Arial; padding: 40px;">
        <h1>🌿 Kava Export App</h1>
        <p>Helping Vanuatu farmers export kava globally.</p>
        <p>
          <a href="/farmers/new">➕ Register Farmer</a> |
          <a href="/farmers">📋 View Farmers</a>
        </p>
      </body>
    </html>
  `);
});

// Register farmer form
app.get("/farmers/new", (req, res) => {
  res.send(`
    <html>
      <head><title>Register Farmer</title></head>
      <body style="font-family: Arial; padding: 40px;">
        <h1>Register Farmer</h1>
        <form method="POST" action="/farmers">
          <p><input name="name" placeholder="Farmer name" required></p>
          <p><input name="island" placeholder="Island" required></p>
          <p><input name="village" placeholder="Village" required></p>
          <p><input name="phone" placeholder="Phone (optional)"></p>
          <button type="submit">Save Farmer</button>
        </form>
        <p><a href="/">⬅ Home</a></p>
      </body>
    </html>
  `);
});

// Save farmer
app.post("/farmers", (req, res) => {
  db.get("farmers")
    .push({
      id: nanoid(8),
      name: req.body.name,
      island: req.body.island,
      village: req.body.village,
      phone: req.body.phone || "",
    })
    .write();

  res.redirect("/farmers");
});

// List farmers
app.get("/farmers", (req, res) => {
  const farmers = db.get("farmers").value();

  const rows = farmers.map(f => `
    <li>
      <b>${f.name}</b> — ${f.village}, ${f.island}
      [ <a href="/batches/new?farmer=${f.id}">Add Batch</a> ]
      [ <a href="/batches/${f.id}">View Batches</a> ]
    </li>
  `).join("");

  res.send(`
    <html>
      <head><title>Farmers</title></head>
      <body style="font-family: Arial; padding: 40px;">
        <h1>Farmers</h1>
        <ul>${rows || "<li>No farmers yet</li>"}</ul>
        <p><a href="/">⬅ Home</a></p>
      </body>
    </html>
  `);
});

// New batch form
app.get("/batches/new", (req, res) => {
  const farmerId = req.query.farmer;

  res.send(`
    <html>
      <head><title>New Kava Batch</title></head>
      <body style="font-family: Arial; padding: 40px;">
        <h1>Add Kava Batch</h1>
        <form method="POST" action="/batches">
          <input type="hidden" name="farmerId" value="${farmerId}">
          <p><input name="cultivar" placeholder="Cultivar (e.g. Borogu)" required></p>
          <p><input name="weight" type="number" step="0.1" placeholder="Weight (kg)" required></p>
          <p><input name="harvestDate" type="date" required></p>
          <p>
            GI Claimed:
            <select name="gi">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </p>
          <button type="submit">Save Batch</button>
        </form>
        <p><a href="/farmers">⬅ Back to Farmers</a></p>
      </body>
    </html>
  `);
});

// Save batch
app.post("/batches", (req, res) => {
  db.get("batches")
    .push({
      id: nanoid(8),
      farmerId: req.body.farmerId,
      cultivar: req.body.cultivar,
      weight: req.body.weight,
      harvestDate: req.body.harvestDate,
      gi: req.body.gi,
    })
    .write();

  res.redirect(`/batches/${req.body.farmerId}`);
});

// View batches per farmer
app.get("/batches/:farmerId", (req, res) => {
  const farmer = db.get("farmers").find({ id: req.params.farmerId }).value();
  const batches = db.get("batches").filter({ farmerId: req.params.farmerId }).value();

  const rows = batches.map(b => `
    <li>
      <b>${b.cultivar}</b> — ${b.weight}kg — ${b.harvestDate} — GI: ${b.gi}
    </li>
  `).join("");

  res.send(`
    <html>
      <head><title>Kava Batches</title></head>
      <body style="font-family: Arial; padding: 40px;">
        <h1>Kava Batches for ${farmer ? farmer.name : "Unknown Farmer"}</h1>
        <ul>${rows || "<li>No batches yet</li>"}</ul>
        <p><a href="/farmers">⬅ Back to Farmers</a></p>
      </body>
    </html>
  `);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
