const express = require("express");
const { nanoid } = require("nanoid");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { query } = require("./db");

const app = express();
app.use(express.urlencoded({ extended: true }));

// Ensure uploads folder exists (still local uploads for now)
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads"),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, Date.now() + "_" + safe);
  },
});
const upload = multer({ storage });

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
        code { background:#f0f2f8; padding:2px 6px; border-radius:8px; }
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
  checks.push({ ok: !!batch.harvest_date, label: "Harvest date recorded" });
  checks.push({ ok: Number(batch.weight) > 0, label: "Weight recorded" });
  return { ok: checks.every(c => c.ok), checks };
}

// ------------- ADMIN: init db schema -------------
app.get("/admin/init-db", async (req, res) => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    // Split on semicolons (simple safe split for our schema)
    const statements = schema.split(";").map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await query(stmt);
    }
    res.send(page("DB Init", `<div class="card ok"><b>✅ Database initialized.</b><div class="small">Tables created (if not existed).</div></div>`));
  } catch (e) {
    res.status(500).send(page("DB Init Error", `<div class="card bad"><b>DB init failed</b><pre class="small">${String(e)}</pre></div>`));
  }
});

// Health check
app.get("/health", (req, res) => res.send("ok"));

// ------------- HOME -------------
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

    <div class="card warn">
      <div class="small"><b>First time after Postgres switch?</b> Open <code>/admin/init-db</code> once to create tables.</div>
    </div>
  `));
});

// ------------- FARMERS -------------
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

app.post("/farmers", async (req, res) => {
  try {
    const id = nanoid(8);
    await query(
      "INSERT INTO farmers (id, name, phone, island, village) VALUES ($1,$2,$3,$4,$5)",
      [id, req.body.name, req.body.phone || null, req.body.island, req.body.village]
    );
    res.redirect("/farmers");
  } catch (e) {
    res.status(500).send(page("Error", `<div class="card bad"><b>Failed to save farmer</b><pre class="small">${String(e)}</pre></div>`));
  }
});

app.get("/farmers", async (req, res) => {
  try {
    const { rows: farmers } = await query("SELECT * FROM farmers ORDER BY created_at DESC");
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
  } catch (e) {
    res.status(500).send(page("Error", `<div class="card bad"><b>Failed to load farmers</b><pre class="small">${String(e)}</pre></div>`));
  }
});

// ------------- BATCHES -------------
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
            <select name="gi"><option value="yes">Yes</option><option value="no">No</option></select>
          </div>
          <div><label>Lab Test Available?</label>
            <select name="lab"><option value="no">No</option><option value="yes">Yes</option></select>
          </div>
        </div>
        <div style="margin-top:12px;"><button class="btn primary" type="submit">Save Batch</button></div>
      </form>
      <div style="margin-top:10px;"><a href="/farmers">⬅ Back</a></div>
    </div>
  `));
});

app.post("/batches", async (req, res) => {
  try {
    const id = nanoid(8);
    await query(
      `INSERT INTO batches (id, farmer_id, cultivar, form, weight, harvest_date, gi, lab)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, req.body.farmerId, req.body.cultivar, req.body.form, Number(req.body.weight), req.body.harvestDate, req.body.gi, req.body.lab]
    );
    res.redirect(`/batches/${req.body.farmerId}`);
  } catch (e) {
    res.status(500).send(page("Error", `<div class="card bad"><b>Failed to save batch</b><pre class="small">${String(e)}</pre></div>`));
  }
});

app.get("/batches/:farmerId", async (req, res) => {
  try {
    const farmerId = req.params.farmerId;
    const farmerRes = await query("SELECT * FROM farmers WHERE id=$1", [farmerId]);
    const farmer = farmerRes.rows[0];

    const { rows: batches } = await query(
      `SELECT b.*,
        (SELECT COUNT(*)::int FROM batch_docs d WHERE d.batch_id=b.id) AS docs_count
       FROM batches b
       WHERE b.farmer_id=$1
       ORDER BY b.created_at DESC`,
      [farmerId]
    );

    const rows = batches.map(b => `
      <div class="card">
        <div class="row" style="justify-content:space-between;">
          <div>
            <b>${b.cultivar}</b> <span class="tag">${b.form}</span> <span class="tag">${b.weight}kg</span>
            <div class="small">Harvest: ${String(b.harvest_date).slice(0,10)} • GI: ${b.gi} • Lab: ${b.lab}</div>
            <div class="small">Batch ID: ${b.id} • Docs: ${b.docs_count}</div>
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
  } catch (e) {
    res.status(500).send(page("Error", `<div class="card bad"><b>Failed to load batches</b><pre class="small">${String(e)}</pre></div>`));
  }
});

// ------------- DOCS (uploads saved + recorded in DB) -------------
app.get("/batches/:batchId/docs", async (req, res) => {
  try {
    const batchId = req.params.batchId;
    const batchRes = await query("SELECT * FROM batches WHERE id=$1", [batchId]);
    const batch = batchRes.rows[0];
    if (!batch) return res.send(page("Docs", `<div class="card bad">Batch not found.</div>`));

    const { rows: docs } = await query("SELECT * FROM batch_docs WHERE batch_id=$1 ORDER BY uploaded_at DESC", [batchId]);
    const docsLinks = docs.map(d => `<li><a href="${d.url}" target="_blank">${d.name}</a> <span class="small">(${d.type})</span></li>`).join("");

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
  } catch (e) {
    res.status(500).send(page("Error", `<div class="card bad"><b>Failed to load docs</b><pre class="small">${String(e)}</pre></div>`));
  }
});

app.post("/batches/:batchId/docs", upload.single("file"), async (req, res) => {
  try {
    const batchId = req.params.batchId;
    const batchRes = await query("SELECT id FROM batches WHERE id=$1", [batchId]);
    if (!batchRes.rows[0]) return res.redirect(`/batches/${batchId}/docs`);

    const doc = {
      id: nanoid(8),
      type: req.body.docType || "other",
      name: req.file.originalname,
      url: `/uploads/${req.file.filename}`,
    };

    await query(
      "INSERT INTO batch_docs (id, batch_id, type, name, url) VALUES ($1,$2,$3,$4,$5)",
      [doc.id, batchId, doc.type, doc.name, doc.url]
    );

    res.redirect(`/batches/${batchId}/docs`);
  } catch (e) {
    res.status(500).send(page("Error", `<div class="card bad"><b>Upload failed</b><pre class="small">${String(e)}</pre></div>`));
  }
});

// ------------- READINESS -------------
app.get("/readiness/:farmerId", async (req, res) => {
  try {
    const farmerId = req.params.farmerId;
    const dest = (req.query.dest || "AU").toUpperCase();

    const farmerRes = await query("SELECT * FROM farmers WHERE id=$1", [farmerId]);
    const farmer = farmerRes.rows[0];

    const { rows: batches } = await query("SELECT * FROM batches WHERE farmer_id=$1 ORDER BY created_at DESC", [farmerId]);

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

    const batchCards = await Promise.all(batches.map(async (b) => {
      const r = checkReadiness(b);
      const klass = r.ok ? "ok" : "warn";
      const items = r.checks.map(c => `<li>${c.ok ? "✅" : "❌"} ${c.label}</li>`).join("");

      const { rows: docs } = await query("SELECT * FROM batch_docs WHERE batch_id=$1 ORDER BY uploaded_at DESC", [b.id]);
      const docItems = docs.map(d => `<li><a href="${d.url}" target="_blank">${d.name}</a></li>`).join("");

      return `
        <div class="card ${klass}">
          <div class="row" style="justify-content:space-between;">
            <div>
              <b>${b.cultivar}</b> <span class="tag">${b.form}</span> <span class="tag">${b.weight}kg</span>
              <div class="small">Batch ${b.id} • Harvest ${String(b.harvest_date).slice(0,10)} • GI ${b.gi} • Lab ${b.lab}</div>
            </div>
            <div class="tag">${r.ok ? "READY" : "NOT READY"}</div>
          </div>
          <div class="small" style="margin-top:8px;"><b>Checks</b></div>
          <ul>${items}</ul>
          <div class="small" style="margin-top:8px;"><b>Uploaded Docs</b></div>
          <ul>${docItems || "<li class='small'>No docs yet. Upload from Batches → Docs.</li>"}</ul>
        </div>
      `;
    }));

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

      ${batchCards.join("") || `<div class="card bad">No batches yet.</div>`}
    `));
  } catch (e) {
    res.status(500).send(page("Error", `<div class="card bad"><b>Failed to load readiness</b><pre class="small">${String(e)}</pre></div>`));
  }
});

// ------------- BUYERS / REQUESTS / OFFERS -------------
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

app.post("/buyers", async (req, res) => {
  try {
    const id = nanoid(8);
    await query(
      "INSERT INTO buyers (id, name, country, email) VALUES ($1,$2,$3,$4)",
      [id, req.body.name, req.body.country, req.body.email || null]
    );
    res.redirect("/requests/new");
  } catch (e) {
    res.status(500).send(page("Error", `<div class="card bad"><b>Failed to save buyer</b><pre class="small">${String(e)}</pre></div>`));
  }
});

app.get("/requests/new", async (req, res) => {
  try {
    const { rows: buyers } = await query("SELECT * FROM buyers ORDER BY created_at DESC");
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
  } catch (e) {
    res.status(500).send(page("Error", `<div class="card bad"><b>Failed to load buyers</b><pre class="small">${String(e)}</pre></div>`));
  }
});

app.post("/requests", async (req, res) => {
  try {
    const id = nanoid(8);
    await query(
      `INSERT INTO requests (id, buyer_id, destination, form, cultivar, min_kg, max_kg, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'open')`,
      [id, req.body.buyerId, req.body.destination, req.body.form, req.body.cultivar || null, Number(req.body.minKg), Number(req.body.maxKg)]
    );
    res.redirect("/requests");
  } catch (e) {
    res.status(500).send(page("Error", `<div class="card bad"><b>Failed to save request</b><pre class="small">${String(e)}</pre></div>`));
  }
});

app.get("/requests", async (req, res) => {
  try {
    const { rows: requests } = await query("SELECT * FROM requests ORDER BY created_at DESC");
    const { rows: buyers } = await query("SELECT * FROM buyers");

    const rows = requests.map(r => {
      const buyer = buyers.find(b => b.id === r.buyer_id);
      return `
        <div class="card">
          <div class="row" style="justify-content:space-between;">
            <div>
              <div><b>Request ${r.id}</b> <span class="tag">${r.status}</span></div>
              <div class="small">Buyer: ${buyer ? buyer.name : "Unknown"} • Dest: ${r.destination}</div>
              <div class="small">Need: ${r.form}${r.cultivar ? " • " + r.cultivar : ""} • Qty: ${r.min_kg}-${r.max_kg}kg</div>
            </div>
            <div class="row">
              <a class="btn primary" href="/offers/new?request=${r.id}">Make Offer</a>
              <a class="btn" href="/offers/${r.id}">View Offers</a>
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
  } catch (e) {
    res.status(500).send(page("Error", `<div class="card bad"><b>Failed to load requests</b><pre class="small">${String(e)}</pre></div>`));
  }
});

app.get("/offers/new", async (req, res) => {
  try {
    const requestId = req.query.request || "";
    const reqRes = await query("SELECT * FROM requests WHERE id=$1", [requestId]);
    const request = reqRes.rows[0];
    if (!request) return res.send(page("Offer", `<div class="card bad">Request not found.</div>`));

    const { rows: farmers } = await query("SELECT * FROM farmers");
    const { rows: batches } = await query("SELECT * FROM batches ORDER BY created_at DESC");

    const batchOptions = batches.map(b => {
      const f = farmers.find(x => x.id === b.farmer_id);
      return `<option value="${b.id}">${b.id} • ${f ? f.name : "?"} • ${b.cultivar} • ${b.form} • ${b.weight}kg • GI:${b.gi} • Lab:${b.lab}</option>`;
    }).join("");

    res.send(page("Make Offer", `
      <div class="card">
        <h3>Make Offer for Request ${request.id}</h3>
        <div class="small">Need: ${request.form}${request.cultivar ? " • " + request.cultivar : ""} • Qty: ${request.min_kg}-${request.max_kg}kg • Dest: ${request.destination}</div>
        <form method="POST" action="/offers">
          <input type="hidden" name="requestId" value="${request.id}">
          <div class="grid2" style="margin-top:10px;">
            <div>
              <label>Select Batch</label>
              <select name="batchId" required>
                <option value="">Select batch...</option>
                ${batchOptions}
              </select>
            </div>
            <div><label>Offer kg</label><input name="offerKg" type="number" step="0.1" required></div>
            <div><label>Price per kg (optional)</label><input name="price" type="number" step="0.1"></div>
            <div><label>Message</label><input name="message" placeholder="Packaging, timeline, quality notes..."></div>
          </div>
          <div style="margin-top:12px;"><button class="btn primary" type="submit">Send Offer</button></div>
        </form>
      </div>
    `));
  } catch (e) {
    res.status(500).send(page("Error", `<div class="card bad"><b>Failed to load offer page</b><pre class="small">${String(e)}</pre></div>`));
  }
});

app.post("/offers", async (req, res) => {
  try {
    const id = nanoid(8);
    await query(
      `INSERT INTO offers (id, request_id, batch_id, offer_kg, price, message, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending')`,
      [id, req.body.requestId, req.body.batchId, Number(req.body.offerKg), req.body.price ? Number(req.body.price) : null, req.body.message || null]
    );
    res.redirect(`/offers/${req.body.requestId}`);
  } catch (e) {
    res.status(500).send(page("Error", `<div class="card bad"><b>Failed to save offer</b><pre class="small">${String(e)}</pre></div>`));
  }
});

app.get("/offers/:requestId", async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const { rows: offers } = await query("SELECT * FROM offers WHERE request_id=$1 ORDER BY created_at DESC", [requestId]);
    const { rows: batches } = await query("SELECT * FROM batches");
    const { rows: farmers } = await query("SELECT * FROM farmers");

    const rows = offers.map(o => {
      const b = batches.find(x => x.id === o.batch_id);
      const f = b ? farmers.find(x => x.id === b.farmer_id) : null;
      return `
        <div class="card">
          <div><b>Offer ${o.id}</b> <span class="tag">${o.status}</span></div>
          <div class="small">Farmer: ${f ? f.name : "?"} • Batch: ${o.batch_id}</div>
          <div class="small">Offer: ${o.offer_kg}kg ${o.price ? "• Price/kg: " + o.price : ""}</div>
          <div class="small">Msg: ${o.message || "—"}</div>
        </div>
      `;
    }).join("");

    res.send(page("Offers", `
      <div class="card">
        <h3>Offers for Request ${requestId}</h3>
        <div class="row">
          <a class="btn" href="/requests">⬅ Back to Requests</a>
          <a class="btn primary" href="/offers/new?request=${requestId}">➕ Make Another Offer</a>
        </div>
      </div>
      ${rows || `<div class="card">No offers yet.</div>`}
    `));
  } catch (e) {
    res.status(500).send(page("Error", `<div class="card bad"><b>Failed to load offers</b><pre class="small">${String(e)}</pre></div>`));
  }
});

// Listen (Render-ready)
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log("Server running on port", PORT));
