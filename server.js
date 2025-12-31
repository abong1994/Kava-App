const express = require("express");
const { nanoid } = require("nanoid");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.urlencoded({ extended: true }));

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Serve uploaded files
app.use("/uploads", express.static(uploadsDir));

// Multer storage (safe filenames)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads"),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, Date.now() + "_" + safe);
  },
});
const upload = multer({ storage });

// DB
const adapter = new FileSync("db.json");
const db = low(adapter);
db.defaults({ farmers: [], batches: [], buyers: [], requests: [], offers: [] }).write();

function page(title, body) {
  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 18px; max-width: 900px; margin: 0 auto; background:#f6f7fb; }
        a { color:#0b5fff; text-decoration:none; }
        a:hover { text-decoration:underline; }
        .card { background:#fff; border:1px solid #e6e8ef; border-radius:14px; padding:14px; margin: 12px 0; }
        .row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
        .btn { display:inline-block; padding:10px 12px; border-radius:12px; border:1px solid #d7dbe8; background:#fff; cursor:pointer; }
        .btn.primary { background:#0b5fff; color:#fff; border-color:#0b5fff; }
        input, select { width: 100%; padding:10px; border-radius:10px; border:1px solid #d7dbe8; }
        label { display:block; font-size: 13px; color:#555; margin-bottom:6px; }
        .grid2 { display:grid; grid-template-columns: 1fr; gap:10px; }
        @media (min-width: 700px) { .grid2 { grid-template-columns: 1fr 1fr; } }
        .small { color:#666; font-size: 13px; }
        .tag { display:inline-block; font-size:12px; padding:4px 8px; border:1px solid #d7dbe8; border-radius:999px; background:#fafbff; }
        .ok { border-color:#b8e2c3; background:#f1fbf4; }
        .warn { border-color:#ffe0a3; background:#fff8e8; }
        .bad { border-color:#ffb3b3; background:#fff1f1; }
        ul { margin: 8px 0 0 18px; }
      </style>
    </head>
    <body>
      <div class="row" style="justify-content:space-between;">
        <div>
          <h2 style="margin:0;">🌿 Kava Export MVP</h2>
          <div class="small">Farmers • Batches • Buyers • Requests • Offers</div>
        </div>
        <div class="row">
          <a class="btn" href="/">Home</a>
          <a class="btn" href="/farmers">Farmers</a>
          <a class="btn" href="/requests">Requests</a>
        </div>
      </div>
      ${body}
    </body>
  </html>`;
}

function requiredDocsFor(dest) {
  const base = [
    "Commercial Invoice",
    "Packing List",
    "Lab Test Report (quality/safety)",
    "Traceability record (batch ID, cultivar, harvest date, weight)",
  ];
  const extra = {
    AU: ["Importer biosecurity / phytosanitary documents (as required)", "Certificate of Origin (if requested)"],
    NZ: ["Importer biosecurity / phytosanitary documents (as required)", "Certificate of Origin (if requested)"],
    US: ["Importer compliance docs (depends on product form)", "Certificate of Origin (if requested)"],
  };
  return base.concat(extra[dest] || []);
}

function checkReadiness(batch) {
  const checks = [];
  checks.push({ ok: batch.form !== "green", label: "Form is Dry/Powder (not Green)" });
  checks.push({ ok: batch.lab === "yes", label: "Lab test available" });
  checks.push({ ok: batch.gi === "yes", label: "GI claimed (starter rule)" });
  checks.push({ ok: !!batch.cultivar, label: "Cultivar recorded" });
  checks.push({ ok: !!batch.harvestDate, label: "Harvest date recorded" });
  checks.push({ ok: typeof batch.weight === "number" && batch.weight > 0, label: "Weight recorded" });
  return { ok: checks.every(c => c.ok), checks };
}

/* HOME */
app.get("/", (req, res) => {
  res.send(page("Home", `
    <div class="card">
      <div class="row">
        <a class="btn primary" href="/farmers/new">➕ Register Farmer</a>
        <a class="btn" href="/farmers">📋 View Farmers</a>
      </div>
    </div>

    <div class="card">
      <div class="row">
        <a class="btn primary" href="/buyers/new">➕ Register Buyer</a>
        <a class="btn" href="/requests/new">🧾 Post Buyer Request</a>
        <a class="btn" href="/requests">🌍 Browse Requests</a>
      </div>
    </div>
  `));
});

/* FARMERS */
app.get("/farmers/new", (req, res) => {
  res.send(page("Register Farmer", `
    <div class="card">
      <h3>Register Farmer</h3>
      <form method="POST" action="/farmers">
        <div class="grid2">
          <div><label>Name</label><input name="name" required></div>
          <div><label>Phone (optional)</label><input name="phone"></div>
          <div><label>Island</label><input name="island" required></div>
          <div><label>Village</label><input name="village" required></div>
        </div>
        <div style="margin-top:12px;"><button class="btn primary" type="submit">Save Farmer</button></div>
      </form>
    </div>
  `));
});

app.post("/farmers", (req, res) => {
  db.get("farmers").push({
    id: nanoid(8),
    name: req.body.name,
    island: req.body.island,
    village: req.body.village,
    phone: req.body.phone || "",
  }).write();
  res.redirect("/farmers");
});

app.get("/farmers", (req, res) => {
  const farmers = db.get("farmers").value();
  const rows = farmers.map(f => `
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <div>
          <div><b>${f.name}</b> <span class="small">— ${f.village}, ${f.island}</span></div>
          <div class="small">${f.phone ? "📞 " + f.phone : ""}</div>
        </div>
        <div class="row">
          <a class="btn" href="/batches/new?farmer=${f.id}">Add Batch</a>
          <a class="btn" href="/batches/${f.id}">View Batches</a>
          <a class="btn" href="/readiness/${f.id}">Readiness</a>
        </div>
      </div>
    </div>
  `).join("");
  res.send(page("Farmers", rows || `<div class="card">No farmers yet.</div>`));
});

/* BATCHES */
app.get("/batches/new", (req, res) => {
  const farmerId = req.query.farmer || "";
  res.send(page("New Batch", `
    <div class="card">
      <h3>Add Kava Batch</h3>
      <form method="POST" action="/batches">
        <input type="hidden" name="farmerId" value="${farmerId}">
        <div class="grid2">
          <div><label>Cultivar</label><input name="cultivar" placeholder="e.g. Borogu" required></div>
          <div><label>Form</label>
            <select name="form">
              <option value="green">Green</option>
              <option value="dry">Dry</option>
              <option value="powder">Powder</option>
            </select>
          </div>
          <div><label>Weight (kg)</label><input name="weight" type="number" step="0.1" required></div>
          <div><label>Harvest Date</label><input name="harvestDate" type="date" required></div>
          <div><label>GI Claimed</label>
            <select name="gi">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div><label>Lab Test Available?</label>
            <select name="lab">
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        </div>
        <div style="margin-top:12px;"><button class="btn primary" type="submit">Save Batch</button></div>
      </form>
      <div style="margin-top:10px;"><a href="/farmers">⬅ Back</a></div>
    </div>
  `));
});

app.post("/batches", (req, res) => {
  db.get("batches").push({
    id: nanoid(8),
    farmerId: req.body.farmerId,
    cultivar: req.body.cultivar,
    form: req.body.form,
    weight: Number(req.body.weight),
    harvestDate: req.body.harvestDate,
    gi: req.body.gi,
    lab: req.body.lab,
    docs: [],
  }).write();
  res.redirect(`/batches/${req.body.farmerId}`);
});

app.get("/batches/:farmerId", (req, res) => {
  const farmerId = req.params.farmerId;
  const farmer = db.get("farmers").find({ id: farmerId }).value();
  const batches = db.get("batches").filter({ farmerId }).value();

  const rows = batches.map(b => `
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <div>
          <b>${b.cultivar}</b> <span class="tag">${b.form}</span> <span class="tag">${b.weight}kg</span>
          <div class="small">Harvest: ${b.harvestDate} • GI: ${b.gi} • Lab: ${b.lab}</div>
          <div class="small">Batch ID: ${b.id} • Docs: ${(b.docs || []).length}</div>
        </div>
        <div class="row">
          <a class="btn" href="/batches/${b.id}/docs">Docs</a>
        </div>
      </div>
    </div>
  `).join("");

  res.send(page("Batches", `
    <div class="card">
      <h3>Batches for ${farmer ? farmer.name : "Unknown Farmer"}</h3>
      <div class="row">
        <a class="btn primary" href="/batches/new?farmer=${farmerId}">➕ Add Batch</a>
        <a class="btn" href="/farmers">⬅ Back</a>
      </div>
    </div>
    ${rows || `<div class="card">No batches yet.</div>`}
  `));
});

/* DOC UPLOADS */
app.get("/batches/:batchId/docs", (req, res) => {
  const batchId = req.params.batchId;
  const batch = db.get("batches").find({ id: batchId }).value();
  if (!batch) return res.send(page("Docs", `<div class="card bad">Batch not found.</div>`));

  const docsLinks = (batch.docs || [])
    .map(d => `<li><a href="${d.url}" target="_blank">${d.name}</a> <span class="small">(${d.type})</span></li>`)
    .join("");

  res.send(page("Batch Docs", `
    <div class="card">
      <h3>Docs for Batch ${batchId}</h3>

      <form method="POST" action="/batches/${batchId}/docs" enctype="multipart/form-data">
        <div class="grid2">
          <div>
            <label>Document Type</label>
            <select name="docType">
              <option value="lab">Lab Test</option>
              <option value="invoice">Invoice</option>
              <option value="packing">Packing List</option>
              <option value="coo">Certificate of Origin</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label>Choose File</label>
            <input type="file" name="file" required />
          </div>
        </div>
        <div style="margin-top:12px;"><button class="btn primary" type="submit">Upload</button></div>
      </form>

      <div class="small" style="margin-top:12px;"><b>Files</b></div>
      <ul>${docsLinks || "<li class='small'>No docs yet.</li>"}</ul>

      <div class="row" style="margin-top:10px;">
        <a class="btn" href="/farmers">⬅ Farmers</a>
      </div>
    </div>
  `));
});

app.post("/batches/:batchId/docs", upload.single("file"), (req, res) => {
  const batchId = req.params.batchId;
  const batch = db.get("batches").find({ id: batchId }).value();
  if (!batch) return res.redirect(`/batches/${batchId}/docs`);

  const doc = {
    id: nanoid(8),
    type: req.body.docType || "other",
    name: req.file.originalname,
    url: `/uploads/${req.file.filename}`,
    uploadedAt: new Date().toISOString(),
  };

  db.get("batches")
    .find({ id: batchId })
    .assign({ docs: [...(batch.docs || []), doc] })
    .write();

  res.redirect(`/batches/${batchId}/docs`);
});

/* READINESS (destination dropdown + docs list) */
app.get("/readiness/:farmerId", (req, res) => {
  const farmerId = req.params.farmerId;
  const dest = (req.query.dest || "AU").toUpperCase(); // AU / NZ / US
  const farmer = db.get("farmers").find({ id: farmerId }).value();
  const batches = db.get("batches").filter({ farmerId }).value();

  const docsList = requiredDocsFor(dest).map(d => `<li>${d}</li>`).join("");

  const destSelect = `
    <form method="GET" action="/readiness/${farmerId}">
      <div class="row">
        <div style="min-width:220px;">
          <label>Destination</label>
          <select name="dest">
            <option value="AU" ${dest==="AU"?"selected":""}>Australia (AU)</option>
            <option value="NZ" ${dest==="NZ"?"selected":""}>New Zealand (NZ)</option>
            <option value="US" ${dest==="US"?"selected":""}>United States (US)</option>
          </select>
        </div>
        <div style="align-self:end;">
          <button class="btn primary" type="submit">Update</button>
        </div>
      </div>
    </form>
  `;

  const batchCards = batches.map(b => {
    const r = checkReadiness(b);
    const klass = r.ok ? "ok" : "warn";
    const items = r.checks.map(c => `<li>${c.ok ? "✅" : "❌"} ${c.label}</li>`).join("");
    const docItems = (b.docs || []).map(d => `<li><a href="${d.url}" target="_blank">${d.name}</a></li>`).join("");

    return `
      <div class="card ${klass}">
        <div class="row" style="justify-content:space-between;">
          <div>
            <b>${b.cultivar}</b> <span class="tag">${b.form}</span> <span class="tag">${b.weight}kg</span>
            <div class="small">Batch ${b.id} • Harvest ${b.harvestDate} • GI ${b.gi} • Lab ${b.lab}</div>
          </div>
          <div class="tag">${r.ok ? "READY" : "NOT READY"}</div>
        </div>
        <div class="small" style="margin-top:8px;"><b>Checks</b></div>
        <ul>${items}</ul>
        <div class="small" style="margin-top:8px;"><b>Uploaded Docs</b></div>
        <ul>${docItems || "<li class='small'>No docs yet. Upload from Batches → Docs.</li>"}</ul>
      </div>
    `;
  }).join("");

  res.send(page("Readiness", `
    <div class="card">
      <h3>Export Readiness: ${farmer ? farmer.name : "Unknown Farmer"}</h3>
      <div class="small">Destination rules: <b>${dest}</b></div>
      <div style="margin-top:10px;">${destSelect}</div>

      <div class="small" style="margin-top:10px;"><b>Required Docs (starter list)</b></div>
      <ul>${docsList}</ul>

      <div class="row" style="margin-top:10px;">
        <a class="btn primary" href="/batches/new?farmer=${farmerId}">➕ Add Batch</a>
        <a class="btn" href="/farmers">⬅ Back</a>
      </div>
    </div>

    ${batchCards || `<div class="card bad">No batches yet.</div>`}
  `));
});

/* BUYERS / REQUESTS / OFFERS (kept simple) */
app.get("/buyers/new", (req, res) => {
  res.send(page("Register Buyer", `
    <div class="card">
      <h3>Register Buyer</h3>
      <form method="POST" action="/buyers">
        <div class="grid2">
          <div><label>Buyer/Company Name</label><input name="name" required></div>
          <div><label>Country</label><input name="country" required></div>
          <div><label>Email (optional)</label><input name="email"></div>
        </div>
        <div style="margin-top:12px;"><button class="btn primary" type="submit">Save Buyer</button></div>
      </form>
    </div>
  `));
});

app.post("/buyers", (req, res) => {
  db.get("buyers").push({
    id: nanoid(8),
    name: req.body.name,
    country: req.body.country,
    email: req.body.email || "",
  }).write();
  res.redirect("/requests/new");
});

app.get("/requests/new", (req, res) => {
  const buyers = db.get("buyers").value();
  const buyerOptions = buyers.map(b => `<option value="${b.id}">${b.name} (${b.country})</option>`).join("");

  res.send(page("New Request", `
    <div class="card">
      <h3>Post Buyer Request</h3>
      <form method="POST" action="/requests">
        <div class="grid2">
          <div>
            <label>Buyer</label>
            <select name="buyerId" required>
              <option value="">Select buyer...</option>
              ${buyerOptions}
            </select>
          </div>
          <div><label>Destination Country</label><input name="destination" required></div>
          <div><label>Form Needed</label>
            <select name="form">
              <option value="green">Green</option>
              <option value="dry">Dry</option>
              <option value="powder">Powder</option>
            </select>
          </div>
          <div><label>Cultivar (optional)</label><input name="cultivar"></div>
          <div><label>Min kg</label><input name="minKg" type="number" step="0.1" required></div>
          <div><label>Max kg</label><input name="maxKg" type="number" step="0.1" required></div>
        </div>
        <div style="margin-top:12px;"><button class="btn primary" type="submit">Post Request</button></div>
      </form>
    </div>
  `));
});

app.post("/requests", (req, res) => {
  db.get("requests").push({
    id: nanoid(8),
    buyerId: req.body.buyerId,
    destination: req.body.destination,
    form: req.body.form,
    cultivar: req.body.cultivar || "",
    minKg: Number(req.body.minKg),
    maxKg: Number(req.body.maxKg),
    status: "open",
    createdAt: new Date().toISOString(),
  }).write();
  res.redirect("/requests");
});

app.get("/requests", (req, res) => {
  const buyers = db.get("buyers").value();
  const requests = db.get("requests").value().slice().reverse();

  const rows = requests.map(r => {
    const buyer = buyers.find(b => b.id === r.buyerId);
    return `
      <div class="card">
        <div class="row" style="justify-content:space-between;">
          <div>
            <div><b>Request ${r.id}</b> <span class="tag">${r.status}</span></div>
            <div class="small">Buyer: ${buyer ? buyer.name : "Unknown"} • Dest: ${r.destination}</div>
            <div class="small">Need: ${r.form}${r.cultivar ? " • " + r.cultivar : ""} • Qty: ${r.minKg}-${r.maxKg}kg</div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  res.send(page("Requests", `
    <div class="card">
      <div class="row">
        <a class="btn primary" href="/requests/new">➕ New Request</a>
        <a class="btn" href="/buyers/new">➕ New Buyer</a>
      </div>
    </div>
    ${rows || `<div class="card">No requests yet.</div>`}
  `));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log("Server running on port", 
PORT));

