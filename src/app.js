(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const STORE_KEY = "cnrMarksSheet.v1";
  const DESIGN_W = 1448;
  const DEFAULTS = {
    className: "VIII",
    branch: "CNR",
    exam: "SA-1",
    subject: "MATHS",
    teacher: "D.V.N.S. Rama Rao",
    maxMarks: "100",
    internalMax: "20",
  };
  const FIELD_IDS = Object.keys(DEFAULTS);

  let mode = "split";
  let students = [];

  /* ---------- small helpers ---------- */
  const clean = (v) => String(v == null ? "" : v).trim();
  const isAb = (v) => /^(ab|absent)$/i.test(clean(v));
  const num = (v) => (clean(v) === "" || isAb(v) ? NaN : Number(clean(v)));
  const esc = (v) =>
    String(v == null ? "" : v).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const fmt = (n) =>
    Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  const details = () => {
    const d = {};
    FIELD_IDS.forEach((id) => {
      d[id] = clean($(id).value);
    });
    return d;
  };
  const maxMarks = () => {
    const n = num($("maxMarks").value);
    return n > 0 ? n : 100;
  };
  const internalMax = () => {
    const n = num($("internalMax").value);
    return n >= 0 ? n : 20;
  };
  const newStudent = () => ({
    name: "",
    external: "",
    internal: mode === "split" ? fmt(internalMax()) : "",
    marks: "",
  });

  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove("show"), 3200);
  }

  /* ---------- marks logic ---------- */
  // 'absent' | 'pending' (incomplete or invalid) | 'ok'
  function status(s) {
    if (mode === "total") {
      if (isAb(s.marks)) return "absent";
      return Number.isFinite(num(s.marks)) ? "ok" : "pending";
    }
    if (isAb(s.external) || isAb(s.internal)) return "absent";
    return Number.isFinite(num(s.external)) && Number.isFinite(num(s.internal))
      ? "ok"
      : "pending";
  }
  const totalOf = (s) =>
    mode === "total" ? num(s.marks) : num(s.external) + num(s.internal);

  // field-level check used to colour the entry boxes
  function fieldState(s, field) {
    const v = s[field];
    if (isAb(v)) return "";
    if (clean(v) === "") {
      const hasData =
        clean(s.name) ||
        ["external", "internal", "marks"].some(
          (f) => f !== field && clean(s[f]),
        );
      return hasData ? "todo" : "";
    }
    const n = num(v);
    if (!Number.isFinite(n) || n < 0) return "bad";
    if (mode === "total") return n > maxMarks() ? "bad" : "";
    if (field === "internal") return n > internalMax() ? "bad" : "";
    if (field === "external")
      return n > maxMarks() - internalMax() ? "bad" : "";
    return "";
  }

  /* ---------- entry table ---------- */
  function renderEntry() {
    const split = mode === "split";
    $("entryHead").innerHTML =
      '<tr><th style="width:36px">#</th><th>Student name</th>' +
      (split ? "<th>External</th><th>Internal</th>" : "<th>Total marks</th>") +
      "<th></th></tr>";
    const rows = students.map((s, i) => {
      const mk = (f) =>
        '<td><input class="mark" data-i="' +
        i +
        '" data-f="' +
        f +
        '" inputmode="decimal" autocomplete="off" aria-label="' +
        f +
        " marks, student " +
        (i + 1) +
        '" value="' +
        esc(s[f]) +
        '"></td>';
      return (
        '<tr><td class="no">' +
        (i + 1) +
        "</td>" +
        '<td><input data-i="' +
        i +
        '" data-f="name" autocomplete="off" placeholder="Student name" aria-label="Name, student ' +
        (i + 1) +
        '" value="' +
        esc(s.name) +
        '"></td>' +
        (split ? mk("external") + mk("internal") : mk("marks")) +
        '<td><button type="button" class="remove" data-remove="' +
        i +
        '" title="Remove" aria-label="Remove student ' +
        (i + 1) +
        '">×</button></td></tr>'
      );
    });
    $("entryBody").innerHTML = rows.join("");
    $("emptyState").hidden = students.length > 0;
    $("entryWrap").style.display = students.length ? "" : "none";
    validateAll();
  }

  function validateAll() {
    let issues = 0;
    document.querySelectorAll("#entryBody input.mark").forEach((inp) => {
      const s = students[+inp.dataset.i];
      const st = fieldState(s, inp.dataset.f);
      inp.classList.toggle("bad", st === "bad");
      inp.classList.toggle("todo", st === "todo");
    });
    students.forEach((s) => {
      const f = mode === "split" ? ["external", "internal"] : ["marks"];
      if (f.some((k) => fieldState(s, k))) issues++;
    });
    const wrap = $("issuesWrap");
    const text = $("issuesText");
    wrap.hidden = issues === 0;
    text.textContent =
      issues +
      (issues === 1 ? " student has" : " students have") +
      " a missing or out-of-range mark (highlighted in red). They are excluded from the total and average until fixed.";
  }

  /* ---------- sheet ---------- */
  function buildTable(el, rows, start) {
    const split = mode === "split";
    const widths = split ? [62, 0, 108, 100, 90] : [62, 0, 130];
    let h =
      "<colgroup>" +
      widths
        .map((w) => "<col" + (w ? ' style="width:' + w + 'px"' : "") + ">")
        .join("") +
      "</colgroup>";
    h +=
      '<thead><tr><th>S.No</th><th class="nm">Name of the Student</th>' +
      (split
        ? "<th>External</th><th>Internal</th><th>Total</th>"
        : "<th>Total</th>") +
      "</tr></thead><tbody>";
    rows.forEach((s, k) => {
      const st = status(s);
      const ab = st === "absent";
      let cells;
      if (split) {
        cells =
          "<td>" +
          (ab ? "AB" : esc(clean(s.external))) +
          "</td>" +
          '<td class="' +
          (ab ? "" : "int") +
          '">' +
          (ab ? "AB" : esc(clean(s.internal))) +
          "</td>" +
          "<td>" +
          (ab ? "AB" : st === "ok" ? fmt(totalOf(s)) : "") +
          "</td>";
      } else {
        cells =
          "<td>" +
          (ab ? "AB" : st === "ok" ? fmt(totalOf(s)) : esc(clean(s.marks))) +
          "</td>";
      }
      h +=
        '<tr><td class="sn">' +
        (start + k + 1) +
        '.</td><td class="nm">' +
        esc(clean(s.name)) +
        "</td>" +
        cells +
        "</tr>";
    });
    el.innerHTML = h + "</tbody>";
  }

  function fitTitle(text) {
    const span = $("sheetTitle");
    span.textContent = text;
    let size = 38;
    try {
      const ctx =
        fitTitle.ctx ||
        (fitTitle.ctx = document.createElement("canvas").getContext("2d"));
      ctx.font = '700 38px "Kalam", "SheetHand", "Patrick Hand SC", cursive';
      const w = ctx.measureText(text).width + text.length * 0.5;
      const avail = span.parentElement.offsetWidth * 0.78 - 6;
      if (w > avail) size = Math.max(18, Math.floor((38 * avail) / w));
    } catch (e) {
      /* keep default size */
    }
    span.style.fontSize = size + "px";
  }

  function render() {
    const d = details();
    fitTitle(
      [d.className, d.branch, d.exam, d.subject]
        .filter(Boolean)
        .join(" - ")
        .toUpperCase(),
    );
    $("sheetSubtitle").textContent =
      "Class " + d.className + (d.branch ? " | " + d.branch + " Branch" : "");
    $("teacherLine").textContent = d.teacher ? "Teacher: " + d.teacher : "";

    const mid = Math.ceil(students.length / 2);
    buildTable($("tblA"), students.slice(0, mid), 0);
    buildTable($("tblB"), students.slice(mid), mid);

    const present = students.filter((s) => status(s) === "ok");
    const grand = present.reduce((sum, s) => sum + totalOf(s), 0);
    const avg = present.length
      ? (grand / (present.length * maxMarks())) * 100
      : 0;
    $("grandTotal").textContent = fmt(grand);
    $("averageValue").textContent = avg.toFixed(2) + "%";

    const absent = students.filter((s) => status(s) === "absent").length;
    const label =
      students.length +
      (students.length === 1 ? " student" : " students") +
      (absent ? " · " + absent + " absent" : "");
    $("studentCount").textContent =
      students.length + (students.length === 1 ? " student" : " students");
    $("previewCount").textContent = label;
    fit();
    save();
  }

  function fit() {
    const stage = $("stage");
    const sheet = $("marksSheet");
    const w = stage.clientWidth;
    if (!w) return;
    const stacked = window.matchMedia("(max-width: 620px)").matches;
    const designW = stacked ? DESIGN_W / 2 : DESIGN_W;
    const h = sheet.offsetHeight;
    const s = w / designW;
    $("scaler").style.transform = "scale(" + s + ")";
    stage.style.height = Math.ceil(h * s) + "px";
    const root = document.documentElement.style;
    const printH = Math.max(
      $("tblA").closest(".page").offsetHeight,
      $("tblB").closest(".page").offsetHeight,
    );
    root.setProperty("--sheet-h", printH);
    root.setProperty(
      "--print-scale",
      Math.min(748 / DESIGN_W, 1060 / printH).toFixed(4),
    );
  }

  /* ---------- persistence ---------- */
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(
          STORE_KEY,
          JSON.stringify({ details: details(), mode, students }),
        );
      } catch (e) {
        /* private mode etc. */
      }
    }, 300);
  }
  function load() {
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch (e) {
      data = null;
    }
    const d = Object.assign({}, DEFAULTS, data && data.details);
    FIELD_IDS.forEach((id) => {
      $(id).value = d[id];
    });
    if (data && (data.mode === "split" || data.mode === "total"))
      mode = data.mode;
    if (data && Array.isArray(data.students)) {
      students = data.students.map((s) => ({
        name: clean(s.name),
        external: clean(s.external),
        internal: clean(s.internal),
        marks: clean(s.marks),
      }));
    }
    document
      .querySelectorAll("[data-mode]")
      .forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  }

  /* ---------- import ---------- */
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const first = text.split(/\r?\n/, 1)[0] || "";
    const count = (ch) => first.split(ch).length - 1;
    const delim =
      count("\t") > count(",") && count("\t") >= count(";")
        ? "\t"
        : count(";") > count(",")
          ? ";"
          : ",";
    const rows = [];
    let row = [],
      field = "",
      quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') {
          field += '"';
          i++;
        } else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === delim) {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    rows.push(row);
    return rows;
  }

  function importRows(rawRows) {
    let rows = rawRows.map((r) => r.map(clean)).filter((r) => r.some(Boolean));
    if (!rows.length) {
      toast("No data found to import.");
      return;
    }

    const norm = (r) => r.map((v) => v.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const nameRe = /^(name|nameofthestudent|studentname|student)$/;
    const totRe = /^(total|totalmarks|marks|score)$/;
    const isHeader = (r) => {
      const n = norm(r);
      return (
        n.some((v) => nameRe.test(v)) ||
        n.some((v) => /external|internal/.test(v))
      );
    };
    let hIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++)
      if (isHeader(rows[i])) {
        hIdx = i;
        break;
      }

    let nameI, extI, intI, totI, data;
    if (hIdx >= 0) {
      const h = norm(rows[hIdx]);
      const find = (re) => h.findIndex((v) => re.test(v));
      nameI = find(nameRe);
      if (nameI < 0)
        nameI = h.findIndex((v) => !/^(sno|slno|serialno|no)$/.test(v));
      extI = find(/external|^ext$/);
      intI = find(/internal|^int$/);
      totI = find(totRe);
      if (mode === "split" && extI < 0) extI = totI;
      if (mode === "total" && totI < 0) totI = extI >= 0 ? extI : nameI + 1;
      data = rows.slice(hIdx + 1);
    } else {
      const off =
        /^\d+\.?$/.test(rows[0][0]) &&
        rows[0][1] &&
        !/^\d+\.?\d*$/.test(rows[0][1])
          ? 1
          : 0;
      nameI = off;
      extI = off + 1;
      intI = off + 2;
      totI = off + 1;
      data = rows;
    }

    const imported = [];
    data.forEach((r) => {
      const name = clean(r[nameI]);
      if (/^(total|grand total|average)/i.test(name)) return;
      const s = { name, external: "", internal: "", marks: "" };
      if (mode === "split") {
        s.external = extI >= 0 ? clean(r[extI]) : "";
        s.internal = intI >= 0 ? clean(r[intI]) : "";
        if (s.internal === "" && !isAb(s.external))
          s.internal = fmt(internalMax());
      } else {
        s.marks = totI >= 0 ? clean(r[totI]) : "";
      }
      if (s.name || s.external || s.marks) imported.push(s);
    });
    if (!imported.length) {
      toast(
        "Could not find any student rows. Check the column headings (Name, External, Internal).",
      );
      return;
    }
    if (
      students.some((s) => clean(s.name)) &&
      !confirm(
        "Replace the " +
          students.length +
          " students already entered with the " +
          imported.length +
          " imported ones?",
      )
    )
      return;
    students = imported;
    renderEntry();
    render();
    toast(imported.length + " students imported.");
  }

  /* ---------- downloads ---------- */
  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const csvCell = (v) =>
    /[",\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  function safeName(suffix) {
    const d = details();
    return [d.className, d.branch, d.exam, d.subject, suffix]
      .filter(Boolean)
      .join("-")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "");
  }
  function csvText() {
    const head =
      mode === "split" ? ["Name", "External", "Internal"] : ["Name", "Marks"];
    const lines = [head.join(",")].concat(
      students.map((s) =>
        (mode === "split"
          ? [s.name, s.external, s.internal]
          : [s.name, s.marks]
        )
          .map(csvCell)
          .join(","),
      ),
    );
    return lines.join("\r\n") + "\r\n";
  }

  async function downloadPng() {
    if (!window.html2canvas) {
      toast("PNG export is unavailable. Use Print / Save as PDF instead.");
      return;
    }
    const btn = $("downloadPng");
    btn.disabled = true;
    btn.textContent = "Preparing PNG…";
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const sheet = $("marksSheet");
      const h = sheet.offsetHeight;
      const scale = Math.min(3, Math.sqrt(16e6 / (DESIGN_W * h)));
      const canvas = await html2canvas(sheet, {
        scale,
        backgroundColor: "#f5f3fd",
        logging: false,
        useCORS: true,
        width: DESIGN_W,
        height: h,
        windowWidth: DESIGN_W + 100,
        onclone: (doc) => {
          const sc = doc.getElementById("scaler");
          sc.style.transform = "none";
          sc.style.position = "static";
          const st = doc.getElementById("stage");
          st.style.height = "auto";
          st.style.overflow = "visible";
          st.style.width = DESIGN_W + "px";
        },
      });
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      download(safeName("Marks-Sheet") + ".png", blob);
      toast("PNG downloaded.");
    } catch (e) {
      console.error(e);
      toast("PNG export failed. Use Print / Save as PDF instead.");
    }
    btn.disabled = false;
    btn.textContent = "Download PNG";
  }

  /* ---------- events ---------- */
  function wire() {
    FIELD_IDS.forEach((id) =>
      $(id).addEventListener("input", () => {
        render();
        validateAll();
      }),
    );

    document.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => {
        if (b.dataset.mode === mode) return;
        const next = b.dataset.mode;
        // carry totals across when moving to "Total only"
        if (next === "total")
          students.forEach((s) => {
            if (!clean(s.marks))
              s.marks =
                status(s) === "absent"
                  ? "Ab"
                  : status(s) === "ok"
                    ? fmt(totalOf(s))
                    : "";
          });
        mode = next;
        document
          .querySelectorAll("[data-mode]")
          .forEach((x) => x.classList.toggle("active", x === b));
        renderEntry();
        render();
      }),
    );

    const body = $("entryBody");
    body.addEventListener("input", (e) => {
      const t = e.target;
      if (!t.dataset.f) return;
      students[+t.dataset.i][t.dataset.f] = t.value;
      render();
      validateAll();
    });
    body.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || !e.target.dataset.f) return;
      e.preventDefault();
      const i = +e.target.dataset.i,
        f = e.target.dataset.f;
      if (i + 1 >= students.length) {
        students.push(newStudent());
        renderEntry();
        render();
      }
      const next = body.querySelector(
        '[data-i="' + (i + 1) + '"][data-f="' + f + '"]',
      );
      if (next) {
        next.focus();
        next.select();
      }
    });
    body.addEventListener("click", (e) => {
      const b = e.target.closest("[data-remove]");
      if (!b) return;
      students.splice(+b.dataset.remove, 1);
      renderEntry();
      render();
    });

    $("addStudent").addEventListener("click", () => {
      students.push(newStudent());
      renderEntry();
      render();
      const w = $("entryWrap");
      w.scrollTop = w.scrollHeight;
      const last = document.querySelector("#entryBody tr:last-child input");
      if (last) last.focus();
    });
    $("clearStudents").addEventListener("click", () => {
      if (
        students.length &&
        confirm("Remove all " + students.length + " students?")
      ) {
        students = [];
        renderEntry();
        render();
      }
    });
    $("fileInput").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        if (/\.(csv|txt)$/i.test(file.name))
          importRows(parseCSV(await file.text()));
        else {
          const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
          importRows(
            XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
              header: 1,
              defval: "",
              raw: false,
            }),
          );
        }
      } catch (err) {
        console.error(err);
        toast("Could not read that file. Try saving it as CSV.");
      }
    });
    $("importPaste").addEventListener("click", () =>
      importRows(parseCSV($("csvPaste").value)),
    );
    $("loadSample").addEventListener("click", () => {
      if (
        students.some((s) => clean(s.name)) &&
        !confirm("Replace the students already entered with sample data?")
      )
        return;
      const names = [
        "Aarav Sharma",
        "Bhavana Reddy",
        "Charan Kumar",
        "Deepika Rao",
        "Eshwar Naidu",
        "Farhana Shaik",
        "Gopi Krishna",
        "Harini Devi",
      ];
      const ext = [72, 65, 58, 80, "Ab", 43, 69, 77];
      mode = "split";
      document
        .querySelectorAll("[data-mode]")
        .forEach((x) =>
          x.classList.toggle("active", x.dataset.mode === "split"),
        );
      students = names.map((n, i) => ({
        name: n.toUpperCase(),
        external: String(ext[i]),
        internal: ext[i] === "Ab" ? "Ab" : fmt(internalMax()),
        marks: "",
      }));
      renderEntry();
      render();
    });
    $("exportCsv").addEventListener("click", () => {
      if (!students.length) {
        toast("Nothing to export yet.");
        return;
      }
      download(
        safeName("Marks") + ".csv",
        new Blob(["﻿" + csvText()], { type: "text/csv;charset=utf-8" }),
      );
    });
    $("downloadTemplate").addEventListener("click", () => {
      const t =
        mode === "split"
          ? "Name,External,Internal\r\nStudent One,75,20\r\nStudent Two,Ab,Ab\r\n"
          : "Name,Marks\r\nStudent One,95\r\nStudent Two,Ab\r\n";
      download(
        "CNR-marks-template.csv",
        new Blob(["﻿" + t], { type: "text/csv;charset=utf-8" }),
      );
    });
    $("downloadPng").addEventListener("click", downloadPng);
    $("printSheet").addEventListener("click", () => {
      fit();
      window.print();
    });

    if (window.ResizeObserver) new ResizeObserver(fit).observe($("stage"));
    window.addEventListener("resize", fit);
  }

  /* ---------- start ---------- */
  document.querySelectorAll("img[data-art]").forEach((img) => {
    img.src = window.ART[img.dataset.art].src;
  });
  load();
  wire();
  renderEntry();
  render();
  const imgs = Array.from(document.querySelectorAll("img[data-art]"));
  Promise.all(
    imgs.map((i) =>
      i.decode ? i.decode().catch(() => {}) : Promise.resolve(),
    ),
  )
    .then(() => (document.fonts && document.fonts.ready) || null)
    .then(() => {
      render();
    });
  window.__cnr = {
    get students() {
      return students;
    },
    get mode() {
      return mode;
    },
  };
})();
