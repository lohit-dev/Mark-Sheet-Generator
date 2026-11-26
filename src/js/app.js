(function () {
  "use strict";

  /* ═══════════════ Constants ═══════════════ */
  const STORE_KEY = "cnrMarksSheet.v1";
  const PAGE_W = 724; // one notebook page on the design canvas
  const SPREAD_W = PAGE_W * 2; // both pages side by side
  const BASE_H = 1086; // 4:3, same proportions as the reference photos
  const FOOT_H = 185;
  const HEAD_ROW_H = 50;
  const MIN_ROW_H = 28;
  const MIN_ROWS = 16; // every sheet has at least 16 ruled rows per page
  const STACK_BELOW = 760; // preview shows pages one above the other under this width
  const RIGHT_FOOT_W = 396; // room between the two flowers on the right page
  const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

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

  /* ═══════════════ State ═══════════════ */
  let mode = "split"; // "split" = external + internal, "total" = one column
  let students = [];
  let beforeSort = null; // the order before the last sort, for Undo
  let printing = false;
  let sheetTimer = 0;
  let saveTimer = 0;

  /* ═══════════════ Small helpers ═══════════════ */
  function $(id) {
    return document.getElementById(id);
  }
  function clean(value) {
    return String(value == null ? "" : value).trim();
  }
  function isAb(value) {
    const text = clean(value).toLowerCase();
    return text === "ab" || text === "absent";
  }
  function num(value) {
    if (clean(value) === "" || isAb(value)) return NaN;
    return Number(clean(value));
  }
  function esc(value) {
    return String(value == null ? "" : value)
      .split("&").join("&amp;")
      .split("<").join("&lt;")
      .split(">").join("&gt;")
      .split('"').join("&quot;");
  }
  function fmt(n) {
    if (Number.isInteger(n)) return String(n);
    return String(Math.round(n * 100) / 100);
  }
  function plural(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }
  function details() {
    const d = {};
    FIELD_IDS.forEach(function (id) {
      d[id] = clean($(id).value);
    });
    return d;
  }
  function maxMarks() {
    const n = num($("maxMarks").value);
    return n > 0 ? n : 100;
  }
  function internalMax() {
    const n = num($("internalMax").value);
    return n >= 0 ? n : 20;
  }
  function newStudent() {
    return {
      name: "",
      external: "",
      internal: mode === "split" ? fmt(internalMax()) : "",
      marks: "",
    };
  }
  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () {
      el.classList.remove("show");
    }, 3400);
  }

  /* ═══════════════ Wording on the sheet ═══════════════ */
  function branchName(value) {
    const text = clean(value);
    if (text.toLowerCase().endsWith(" branch")) {
      return text.slice(0, text.length - 7).trim();
    }
    return text;
  }
  // SA-1 is written SA-I on the paper sheets, MIDTERM becomes MIDTERM EXAM
  function examLabel(value) {
    if (value === "MIDTERM") return "MIDTERM EXAM";
    const parts = value.split("-");
    if (parts.length === 2 && (parts[0] === "SA" || parts[0] === "FA")) {
      const n = Number(parts[1]);
      if (n >= 1 && n <= 10) return parts[0] + "-" + ROMAN[n];
    }
    return value;
  }
  function titleText(d) {
    return [d.className, branchName(d.branch), examLabel(d.exam), d.subject]
      .filter(Boolean)
      .join(" - ")
      .toUpperCase();
  }
  function subtitleText(d) {
    const branch = branchName(d.branch);
    return "Class " + d.className + (branch ? " | " + branch + " Branch" : "");
  }

  /* ═══════════════ Marks logic ═══════════════ */
  // "absent", "pending" (incomplete or not a number) or "ok"
  function status(s) {
    if (mode === "total") {
      if (isAb(s.marks)) return "absent";
      return Number.isFinite(num(s.marks)) ? "ok" : "pending";
    }
    if (isAb(s.external) || isAb(s.internal)) return "absent";
    const complete = Number.isFinite(num(s.external)) && Number.isFinite(num(s.internal));
    return complete ? "ok" : "pending";
  }
  function totalOf(s) {
    if (mode === "total") return num(s.marks);
    return num(s.external) + num(s.internal);
  }
  // "" when fine, "bad" for a wrong number, "todo" for an empty box
  function fieldState(s, field) {
    const value = s[field];
    if (isAb(value)) return "";
    if (clean(value) === "") {
      let hasData = clean(s.name) !== "";
      ["external", "internal", "marks"].forEach(function (other) {
        if (other !== field && clean(s[other]) !== "") hasData = true;
      });
      return hasData ? "todo" : "";
    }
    const n = num(value);
    if (!Number.isFinite(n) || n < 0) return "bad";
    if (mode === "total") return n > maxMarks() ? "bad" : "";
    if (field === "internal") return n > internalMax() ? "bad" : "";
    if (field === "external") return n > maxMarks() - internalMax() ? "bad" : "";
    return "";
  }
  function fieldsInUse() {
    return mode === "split" ? ["external", "internal"] : ["marks"];
  }
  function problemCount() {
    let count = 0;
    students.forEach(function (s) {
      const bad = fieldsInUse().some(function (field) {
        return fieldState(s, field) !== "";
      });
      if (bad) count++;
    });
    return count;
  }
  function stats() {
    const present = students.filter(function (s) {
      return status(s) === "ok";
    });
    let grand = 0;
    present.forEach(function (s) {
      grand += totalOf(s);
    });
    const average = present.length ? (grand / (present.length * maxMarks())) * 100 : 0;
    const absent = students.filter(function (s) {
      return status(s) === "absent";
    }).length;
    return { grand: grand, average: average, absent: absent, present: present.length };
  }

  /* ═══════════════ Student cards (the Marks step) ═══════════════ */
  function cellInput(label, field, i, s) {
    return (
      '<label class="cell"><span>' + label + "</span>" +
      '<input class="mark" data-i="' + i + '" data-f="' + field + '"' +
      ' inputmode="decimal" enterkeyhint="next" autocomplete="off"' +
      ' value="' + esc(s[field]) + '"></label>'
    );
  }
  function cardHtml(s, i) {
    const absent = status(s) === "absent";
    const split = mode === "split";
    let h = '<div class="stu' + (absent ? " absent" : "") + '" data-card="' + i + '">';
    h += '<div class="stu-top"><span class="stu-no">' + (i + 1) + "</span>";
    h +=
      '<input data-i="' + i + '" data-f="name" autocomplete="off"' +
      ' autocapitalize="words" enterkeyhint="next" placeholder="Student name"' +
      ' aria-label="Name of student ' + (i + 1) + '" value="' + esc(s.name) + '">';
    h +=
      '<button type="button" class="stu-del" data-del="' + i + '"' +
      ' aria-label="Remove student ' + (i + 1) + '">×</button></div>';
    h += '<div class="stu-marks' + (split ? "" : " single") + '">';
    if (split) {
      h += cellInput("External", "external", i, s);
      h += cellInput("Internal", "internal", i, s);
      h += '<div class="cell"><span>Total</span><output data-total="' + i + '"></output></div>';
    } else {
      h += cellInput("Total marks", "marks", i, s);
    }
    h +=
      '<div class="cell"><span>Absent</span>' +
      '<button type="button" class="ab" data-ab="' + i + '"' +
      ' aria-pressed="' + (absent ? "true" : "false") + '">Ab</button></div>';
    h += "</div></div>";
    return h;
  }
  function renderStudents() {
    $("students").innerHTML = students.map(cardHtml).join("");
    $("emptyState").hidden = students.length > 0;
    $("sortBar").hidden = students.length < 2;
    students.forEach(function (s, i) {
      paintCard(i);
    });
  }
  // updates the colours, total and Ab button of one card without rebuilding it
  function paintCard(i) {
    const card = document.querySelector('[data-card="' + i + '"]');
    if (!card) return;
    const s = students[i];
    const absent = status(s) === "absent";
    card.classList.toggle("absent", absent);
    const toggle = card.querySelector(".ab");
    toggle.setAttribute("aria-pressed", absent ? "true" : "false");
    card.querySelectorAll("input.mark").forEach(function (input) {
      const state = fieldState(s, input.dataset.f);
      input.classList.toggle("bad", state === "bad");
      input.classList.toggle("todo", state === "todo");
    });
    const output = card.querySelector("output");
    if (output) {
      const state = status(s);
      output.textContent = absent ? "Ab" : state === "ok" ? fmt(totalOf(s)) : "–";
    }
  }
  function toggleAbsent(i) {
    const s = students[i];
    const makeAbsent = status(s) !== "absent";
    if (mode === "split") {
      s.external = makeAbsent ? "Ab" : "";
      s.internal = makeAbsent ? "Ab" : fmt(internalMax());
    } else {
      s.marks = makeAbsent ? "Ab" : "";
    }
    const card = document.querySelector('[data-card="' + i + '"]');
    card.outerHTML = cardHtml(s, i);
    paintCard(i);
    afterEdit();
  }
  function addStudent() {
    students.push(newStudent());
    renderStudents();
    afterEdit();
    const last = document.querySelector('[data-card="' + (students.length - 1) + '"]');
    if (last) {
      last.scrollIntoView({ block: "center" });
      last.querySelector("input").focus();
    }
  }
  function removeStudent(i) {
    students.splice(i, 1);
    renderStudents();
    afterEdit();
  }
  /* ═══════════════ Sorting ═══════════════ */
  // students with full marks first, then unfinished ones, then absent ones
  function sortGroup(s) {
    const state = status(s);
    if (state === "ok") return 0;
    return state === "pending" ? 1 : 2;
  }
  function compareBy(how, a, b) {
    if (how === "name") {
      const x = clean(a.name);
      const y = clean(b.name);
      if (x === "" || y === "") return x === "" ? (y === "" ? 0 : 1) : -1;
      return x.localeCompare(y, undefined, { sensitivity: "base" });
    }
    const groupGap = sortGroup(a) - sortGroup(b);
    if (groupGap !== 0) return groupGap;
    if (sortGroup(a) !== 0) return 0;
    return how === "high" ? totalOf(b) - totalOf(a) : totalOf(a) - totalOf(b);
  }
  function sortStudents(how) {
    if (students.length < 2) return;
    if (!beforeSort) beforeSort = students.slice();
    students.sort(function (a, b) {
      return compareBy(how, a, b);
    });
    $("undoSort").hidden = false;
    renderStudents();
    afterEdit();
    window.scrollTo(0, 0);
    const words = { high: "highest marks first", low: "lowest marks first", name: "A to Z" };
    toast("Sorted " + words[how] + ". Tap Undo to go back.");
  }
  function undoSort() {
    if (!beforeSort) return;
    const kept = beforeSort.filter(function (s) {
      return students.includes(s);
    });
    const added = students.filter(function (s) {
      return !beforeSort.includes(s);
    });
    students = kept.concat(added);
    beforeSort = null;
    $("undoSort").hidden = true;
    renderStudents();
    afterEdit();
    toast("Back to the order you typed.");
  }
  // Enter / "Next" on the phone keyboard moves to the next box
  function focusNext(target) {
    const boxes = Array.from($("students").querySelectorAll("input[data-f]"));
    let index = boxes.indexOf(target) + 1;
    // the internal mark is usually already filled in, so skip over it
    while (index < boxes.length && boxes[index].dataset.f === "internal" && clean(boxes[index].value) !== "") {
      index++;
    }
    if (index >= boxes.length) {
      addStudent();
      return;
    }
    boxes[index].focus();
  }

  /* ═══════════════ Summary, top bar, warnings ═══════════════ */
  function updateSummary() {
    const d = details();
    const st = stats();
    const average = st.average.toFixed(2) + "%";
    $("sumStudents").textContent = students.length;
    $("sumAbsent").textContent = st.absent;
    $("sumAverage").textContent = average;
    $("totStudents").textContent = students.length;
    $("totAbsent").textContent = st.absent;
    $("totAverage").textContent = average;
    $("totGrand").textContent = fmt(st.grand);
    $("totStudents").textContent = students.length;
    $("totGrand").textContent = fmt(st.grand);
    $("totAverage").textContent = average;
    $("barTitle").textContent = titleText(d) || "Marks Sheet";
    $("barSub").textContent = plural(students.length, "student") + " · Average " + average;

    const problems = problemCount();
    const issues = $("issues");
    issues.hidden = problems === 0;
    issues.innerHTML =
      "<b>" + plural(problems, "student") + "</b> " +
      (problems === 1 ? "has" : "have") +
      " a missing or wrong mark. They are left out of the total until fixed. Tap here to jump to the first one.";
    $("tabBadge").hidden = problems === 0;
    $("internalField").hidden = mode !== "split";
  }

  /* ═══════════════ The sheet ═══════════════ */
  const measureCtx = document.createElement("canvas").getContext("2d");
  function textWidth(text, size, family) {
    measureCtx.font = size + "px " + family;
    return measureCtx.measureText(text).width;
  }
  // biggest font size (up to maxSize) that keeps one line inside maxWidth
  function fitOneLine(text, family, maxSize, maxWidth, minSize, spacingEm) {
    const at100 = textWidth(text, 100, family) + 100 * spacingEm * text.length;
    const size = Math.floor((maxWidth / at100) * 100);
    return Math.max(minSize, Math.min(maxSize, size));
  }
  function field(root, name) {
    return root.querySelector('[data-f="' + name + '"]');
  }

  function columnWidths(split) {
    return split ? [62, 0, 108, 100, 90] : [96, 0, 182];
  }
  function layoutFor(count, split) {
    const rows = Math.max(MIN_ROWS, Math.ceil(count / 2));
    const top = split ? 120 : 152;
    const room = BASE_H - top - HEAD_ROW_H - FOOT_H;
    let rowH = Math.floor(room / rows);
    if (rowH < MIN_ROW_H) rowH = MIN_ROW_H;
    if (rowH > 46) rowH = 46;
    return {
      rows: rows,
      top: top,
      rowH: rowH,
      nameFs: Math.round(rowH * (split ? 0.55 : 0.72)),
      numFs: Math.round(rowH * (split ? 0.72 : 0.74)),
    };
  }
  function nameColumnWidth(split) {
    let fixed = 0;
    columnWidths(split).forEach(function (w) {
      fixed += w;
    });
    return PAGE_W - 34 - fixed - 24;
  }
  // long names drop to a smaller two-line size so they never push the row taller
  function nameClass(name, nameFs, room) {
    const width = textWidth(name.toUpperCase(), nameFs, '"Patrick Hand"') + name.length * 0.3;
    if (width <= room) return "";
    if (width * 0.82 <= room * 1.8) return " two";
    return " tiny";
  }
  function tableHtml(rows, startIndex, lay, split) {
    const room = nameColumnWidth(split);
    let h = "<colgroup>";
    columnWidths(split).forEach(function (w) {
      h += w ? '<col style="width:' + w + 'px">' : "<col>";
    });
    h += "</colgroup><thead><tr><th>S.No</th><th class=\"nm\">Name of the Student</th>";
    h += split ? "<th>External</th><th>Internal</th><th>Total</th>" : "<th>Total Marks</th>";
    h += "</tr></thead><tbody>";
    for (let k = 0; k < lay.rows; k++) {
      const s = rows[k];
      if (!s) {
        h += '<tr><td class="sn"></td><td class="nm"></td>' + (split ? "<td></td><td></td><td></td>" : "<td></td>") + "</tr>";
        continue;
      }
      const st = status(s);
      const absent = st === "absent";
      const name = clean(s.name);
      h += '<tr><td class="sn">' + (startIndex + k + 1) + ".</td>";
      h += '<td class="nm' + nameClass(name, lay.nameFs, room) + '">' + esc(name) + "</td>";
      if (split) {
        h += "<td>" + (absent ? "Ab" : esc(clean(s.external))) + "</td>";
        h += '<td class="int">' + (absent ? "Ab" : esc(clean(s.internal))) + "</td>";
        h += "<td>" + (absent ? "Ab" : st === "ok" ? fmt(totalOf(s)) : "") + "</td>";
      } else {
        h += "<td>" + (absent ? "Ab" : st === "ok" ? fmt(totalOf(s)) : esc(clean(s.marks))) + "</td>";
      }
      h += "</tr>";
    }
    return h + "</tbody>";
  }

  // Ribbon, title and subtitle. The title sits inside the ribbon's flat band
  // (22%–78% of its width) so it never runs onto the folded tails.
  function renderHeader(root, d, split, stacked) {
    let g;
    if (split) {
      g = { left: 150, top: 6, w: 548, h: 92, cx: 424, subTop: 72, subMax: 34 };
    } else if (stacked) {
      g = { left: 42, top: 6, w: 640, h: 108, cx: PAGE_W / 2, subTop: 72, subMax: 36 };
    } else {
      // centred on the spine, across both pages
      g = { left: PAGE_W - 450, top: 6, w: 900, h: 140, cx: PAGE_W, subTop: 100, subMax: 40 };
    }
    const ribbon = field(root, "ribbon");
    ribbon.style.left = g.left + "px";
    ribbon.style.top = g.top + "px";
    ribbon.style.width = g.w + "px";
    ribbon.style.height = g.h + "px";

    const title = field(root, "title");
    const text = titleText(d);
    title.textContent = text;
    title.style.letterSpacing = "0.07em";
    title.style.fontSize = fitOneLine(text, '"Patrick Hand"', Math.round(g.h * 0.3), g.w * 0.6, 12, 0.07) + "px";

    const subtitle = field(root, "subtitle");
    const sub = subtitleText(d);
    subtitle.textContent = sub;
    subtitle.style.letterSpacing = "0.08em";
    subtitle.style.left = g.cx - 400 + "px";
    subtitle.style.width = "800px";
    subtitle.style.top = g.subTop + "px";
    subtitle.style.fontSize = fitOneLine(sub.toUpperCase(), '"Patrick Hand"', g.subMax, g.w * 0.56, 14, 0.08) + "px";
  }

  function renderFooter(root, d, st) {
    const avg = field(root, "avgText");
    const avgLabel = st.average.toFixed(2) + "%";
    avg.innerHTML = "Average =<b>" + avgLabel + "</b>";
    avg.style.fontSize = fitLabel("Average =", avgLabel, 430) + "px";

    const total = field(root, "totText");
    total.innerHTML = "Grand Total =<b>" + fmt(st.grand) + "</b>";
    total.style.fontSize = fitLabel("Grand Total =", fmt(st.grand), 400) + "px";

    const teacher = field(root, "teacher");
    const line = d.teacher ? "Teacher: " + d.teacher : "";
    teacher.textContent = line;
    teacher.style.fontSize = line ? fitOneLine(line, "Kalam", 30, RIGHT_FOOT_W, 14, 0) + "px" : "";
  }
  // label text is a script word plus a red number, both must fit the scalloped label
  function fitLabel(word, value, labelW) {
    const at100 = textWidth(word, 100, "Kalam") + textWidth(value, 118, '"Sheet Digits", "Patrick Hand"');
    const room = labelW * 0.78 - 14;
    return Math.max(18, Math.min(44, Math.floor((room / at100) * 100)));
  }

  // Lays out one sheet element completely and returns the page height.
  // Used for the live preview, for printing and for the PNG export.
  function renderSheet(root, stacked) {
    const d = details();
    const split = mode === "split";
    const lay = layoutFor(students.length, split);
    const st = stats();
    root.classList.toggle("stacked", stacked);
    root.classList.toggle("total-only", !split);
    root.style.setProperty("--table-top", lay.top + "px");
    root.style.setProperty("--row-h", lay.rowH + "px");
    root.style.setProperty("--name-fs", lay.nameFs + "px");
    root.style.setProperty("--num-fs", lay.numFs + "px");

    renderHeader(root, d, split, stacked);
    const mid = Math.ceil(students.length / 2);
    field(root, "tblA").innerHTML = tableHtml(students.slice(0, mid), 0, lay, split);
    field(root, "tblB").innerHTML = tableHtml(students.slice(mid), mid, lay, split);
    renderFooter(root, d, st);

    const tableH = Math.max(field(root, "tblA").offsetHeight, field(root, "tblB").offsetHeight);
    const pageH = lay.top + tableH + FOOT_H;
    root.style.setProperty("--page-h", pageH + "px");
    return pageH;
  }

  function stageWidth() {
    return $("stage").clientWidth;
  }
  function refreshSheet() {
    const sheet = $("marksSheet");
    const width = stageWidth();
    if (!width) return; // the Sheet step is not on screen, it redraws when opened
    const stacked = !printing && width < STACK_BELOW;
    const pageH = renderSheet(sheet, stacked);
    let designW = stacked ? PAGE_W : SPREAD_W;
    let scale = width / designW;
    let height = stacked ? pageH * 2 : pageH;
    if (printing) {
      // A4 landscape with 6mm margins is about 1077 x 748 CSS pixels
      scale = Math.min(1077 / SPREAD_W, 748 / pageH);
    }
    const scaler = $("scaler");
    scaler.style.width = designW + "px";
    scaler.style.transform = "scale(" + scale + ")";
    $("stage").style.height = Math.ceil(height * scale) + "px";
  }
  function scheduleSheet() {
    clearTimeout(sheetTimer);
    sheetTimer = setTimeout(refreshSheet, 120);
  }

  /* ═══════════════ Saving ═══════════════ */
  function writeNow() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ details: details(), mode: mode, students: students }),
      );
    } catch (error) {
      // private browsing: nothing to do
    }
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 200);
  }
  // phones can close the page without warning, so save the moment it is hidden
  function saveNow() {
    clearTimeout(saveTimer);
    writeNow();
  }
  function load() {
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch (error) {
      data = null;
    }
    const saved = data && data.details ? data.details : {};
    FIELD_IDS.forEach(function (id) {
      $(id).value = saved[id] !== undefined ? saved[id] : DEFAULTS[id];
    });
    if (data && (data.mode === "split" || data.mode === "total")) mode = data.mode;
    if (data && Array.isArray(data.students)) {
      students = data.students.map(function (s) {
        return {
          name: clean(s.name),
          external: clean(s.external),
          internal: clean(s.internal),
          marks: clean(s.marks),
        };
      });
    }
    document.querySelectorAll("[data-mode]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.mode === mode);
    });
    return students.length > 0;
  }
  // called after any change to the data
  function afterEdit() {
    updateSummary();
    scheduleSheet();
    save();
  }

  /* ═══════════════ Steps (tabs on phones) ═══════════════ */
  function setTab(name) {
    document.body.dataset.tab = name;
    document.querySelectorAll("[data-tab-btn]").forEach(function (button) {
      if (button.dataset.tabBtn === name) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
    if (name === "sheet") refreshSheet();
  }

  /* ═══════════════ Import ═══════════════ */
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    let firstLine = text;
    const end = text.indexOf("\n");
    if (end >= 0) firstLine = text.slice(0, end);
    const count = function (ch) {
      return firstLine.split(ch).length - 1;
    };
    let delimiter = ",";
    if (count("\t") > count(",") && count("\t") >= count(";")) delimiter = "\t";
    else if (count(";") > count(",")) delimiter = ";";

    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === delimiter) {
        row.push(cell);
        cell = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        cell = "";
        rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell);
    rows.push(row);
    return rows;
  }
  // lower-case letters and digits only, so "Name of the Student" becomes "nameofthestudent"
  function simplify(value) {
    let out = "";
    String(value).toLowerCase().split("").forEach(function (ch) {
      const isLetter = ch >= "a" && ch <= "z";
      const isDigit = ch >= "0" && ch <= "9";
      if (isLetter || isDigit) out += ch;
    });
    return out;
  }
  function isWholeNumber(text) {
    const t = text.endsWith(".") ? text.slice(0, text.length - 1) : text;
    return t !== "" && t.split("").every(function (ch) {
      return ch >= "0" && ch <= "9";
    });
  }
  function isNameHeading(word) {
    return ["name", "nameofthestudent", "studentname", "student"].includes(word);
  }
  function isTotalHeading(word) {
    return ["total", "totalmarks", "marks", "score"].includes(word);
  }
  function importRows(rawRows) {
    const rows = rawRows
      .map(function (r) {
        return r.map(clean);
      })
      .filter(function (r) {
        return r.some(Boolean);
      });
    if (!rows.length) {
      toast("No data found to import.");
      return;
    }

    let headerAt = -1;
    for (let i = 0; i < Math.min(rows.length, 10) && headerAt < 0; i++) {
      const words = rows[i].map(simplify);
      const hasName = words.some(isNameHeading);
      const hasMarks = words.some(function (w) {
        return w.includes("external") || w.includes("internal");
      });
      if (hasName || hasMarks) headerAt = i;
    }

    let nameI = 0;
    let extI = 1;
    let intI = 2;
    let totI = 1;
    let data = rows;
    if (headerAt >= 0) {
      const words = rows[headerAt].map(simplify);
      nameI = words.findIndex(isNameHeading);
      if (nameI < 0) {
        nameI = words.findIndex(function (w) {
          return !["sno", "slno", "serialno", "no"].includes(w);
        });
      }
      extI = words.findIndex(function (w) {
        return w.includes("external") || w === "ext";
      });
      intI = words.findIndex(function (w) {
        return w.includes("internal") || w === "int";
      });
      totI = words.findIndex(isTotalHeading);
      if (mode === "split" && extI < 0) extI = totI;
      if (mode === "total" && totI < 0) totI = extI >= 0 ? extI : nameI + 1;
      data = rows.slice(headerAt + 1);
    } else if (isWholeNumber(rows[0][0]) && rows[0][1] && !isWholeNumber(rows[0][1])) {
      // first column is the serial number
      nameI = 1;
      extI = 2;
      intI = 3;
      totI = 2;
    }

    const imported = [];
    data.forEach(function (r) {
      const name = clean(r[nameI]);
      const lower = name.toLowerCase();
      if (lower.startsWith("total") || lower.startsWith("grand total") || lower.startsWith("average")) return;
      const s = { name: name, external: "", internal: "", marks: "" };
      if (mode === "split") {
        s.external = extI >= 0 ? clean(r[extI]) : "";
        s.internal = intI >= 0 ? clean(r[intI]) : "";
        if (s.internal === "" && !isAb(s.external)) s.internal = fmt(internalMax());
      } else {
        s.marks = totI >= 0 ? clean(r[totI]) : "";
      }
      if (s.name || s.external || s.marks) imported.push(s);
    });
    if (!imported.length) {
      toast("Could not find any students. Check the column headings (Name, External, Internal).");
      return;
    }
    const hasStudents = students.some(function (s) {
      return clean(s.name) !== "";
    });
    if (hasStudents && !confirm("Replace the " + students.length + " students already entered with the " + imported.length + " imported ones?")) {
      return;
    }
    students = imported;
    renderStudents();
    afterEdit();
    toast(plural(imported.length, "student") + " imported.");
  }

  /* ═══════════════ Downloads, sharing, printing ═══════════════ */
  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 4000);
  }
  function slug(text) {
    let out = "";
    let dash = false;
    String(text).split("").forEach(function (ch) {
      const lower = ch.toLowerCase();
      const ok = (lower >= "a" && lower <= "z") || (ch >= "0" && ch <= "9");
      if (ok) {
        out += ch;
        dash = false;
      } else if (!dash && out !== "") {
        out += "-";
        dash = true;
      }
    });
    return dash ? out.slice(0, out.length - 1) : out;
  }
  function fileName(suffix, extension) {
    const d = details();
    return slug([d.className, d.branch, d.exam, d.subject, suffix].filter(Boolean).join(" ")) + "." + extension;
  }
  function csvCell(value) {
    const text = String(value);
    const needsQuotes = text.includes(",") || text.includes('"') || text.includes("\n");
    return needsQuotes ? '"' + text.split('"').join('""') + '"' : text;
  }
  function csvText() {
    const head = mode === "split" ? ["Name", "External", "Internal"] : ["Name", "Marks"];
    const lines = [head.join(",")];
    students.forEach(function (s) {
      const cells = mode === "split" ? [s.name, s.external, s.internal] : [s.name, s.marks];
      lines.push(cells.map(csvCell).join(","));
    });
    return lines.join("\r\n") + "\r\n";
  }

  // Draws the full two-page spread on a hidden copy so the picture is always
  // wide, whatever the screen size is.
  async function makePng() {
    if (!window.html2canvas) throw new Error("html2canvas is missing");
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-20000px;top:0;width:" + SPREAD_W + "px;pointer-events:none";
    const copy = $("marksSheet").cloneNode(true);
    copy.removeAttribute("id");
    holder.appendChild(copy);
    document.body.appendChild(holder);
    try {
      const pictures = Array.from(copy.querySelectorAll("img"));
      await Promise.all(
        pictures.map(function (img) {
          return img.decode ? img.decode().catch(function () {}) : Promise.resolve();
        }),
      );
      renderSheet(copy, false);
      const scale = window.matchMedia("(pointer: coarse)").matches ? 2 : 3;
      const canvas = await html2canvas(copy, {
        scale: scale,
        backgroundColor: "#f5f3fd",
        logging: false,
        width: SPREAD_W,
        height: copy.offsetHeight,
        windowWidth: SPREAD_W,
      });
      return await new Promise(function (resolve) {
        canvas.toBlob(resolve, "image/png");
      });
    } finally {
      holder.remove();
    }
  }
  async function withBusyButton(button, busyText, work) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
    try {
      await work();
    } catch (error) {
      console.error(error);
      toast("Could not make the picture. Try Print / Save as PDF instead.");
    }
    button.disabled = false;
    button.textContent = original;
  }
  function savePicture() {
    return withBusyButton($("downloadPng"), "Making picture…", async function () {
      const blob = await makePng();
      download(fileName("Marks-Sheet", "png"), blob);
      toast("Picture saved to your downloads.");
    });
  }
  function sharePicture() {
    return withBusyButton($("sharePng"), "Making picture…", async function () {
      const blob = await makePng();
      const file = new File([blob], fileName("Marks-Sheet", "png"), { type: "image/png" });
      try {
        await navigator.share({ files: [file], title: titleText(details()) });
      } catch (error) {
        if (error && error.name === "AbortError") return; // she closed the share sheet
        download(file.name, blob);
        toast("Sharing is not available here, so the picture was saved instead.");
      }
    });
  }
  function canShareFiles() {
    if (!navigator.canShare || !navigator.share) return false;
    try {
      return navigator.canShare({ files: [new File(["x"], "x.png", { type: "image/png" })] });
    } catch (error) {
      return false;
    }
  }
  function beginPrint() {
    printing = true;
    refreshSheet();
  }
  function endPrint() {
    printing = false;
    refreshSheet();
  }
  function printSheet() {
    // the print preview needs the Sheet step on screen to measure it
    if (!stageWidth()) setTab("sheet");
    beginPrint();
    setTimeout(function () {
      window.print();
    }, 100);
  }

  /* ═══════════════ Sample data ═══════════════ */
  function loadSample() {
    const hasStudents = students.some(function (s) {
      return clean(s.name) !== "";
    });
    if (hasStudents && !confirm("Replace the students already entered with sample data?")) return;
    const names = ["Aarav Sharma", "Bhavana Reddy", "Charan Kumar", "Deepika Rao", "Eshwar Naidu", "Farhana Shaik", "Gopi Krishna", "Harini Devi"];
    const external = ["72", "65", "58", "80", "Ab", "43", "69", "77"];
    mode = "split";
    document.querySelectorAll("[data-mode]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.mode === "split");
    });
    students = names.map(function (name, i) {
      const absent = external[i] === "Ab";
      return {
        name: name.toUpperCase(),
        external: external[i],
        internal: absent ? "Ab" : fmt(internalMax()),
        marks: "",
      };
    });
    renderStudents();
    afterEdit();
  }

  /* ═══════════════ Events ═══════════════ */
  function setMode(next) {
    if (next === mode) return;
    if (next === "total") {
      // keep the totals already worked out
      students.forEach(function (s) {
        if (clean(s.marks) !== "") return;
        const st = status(s);
        s.marks = st === "absent" ? "Ab" : st === "ok" ? fmt(totalOf(s)) : "";
      });
    }
    mode = next;
    document.querySelectorAll("[data-mode]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.mode === mode);
    });
    renderStudents();
    afterEdit();
  }
  function isTypingTarget(el) {
    return el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA");
  }
  let baseWidth = 0;
  let baseHeight = 0;
  function updateTyping() {
    const view = window.visualViewport;
    const height = view ? view.height : window.innerHeight;
    // the tallest height seen at this width is the "no keyboard" height
    if (window.innerWidth !== baseWidth || height > baseHeight) {
      baseWidth = window.innerWidth;
      baseHeight = height;
    }
    const keyboardOpen = height < baseHeight * 0.75;
    document.body.classList.toggle("typing", keyboardOpen && isTypingTarget(document.activeElement));
  }
  function wire() {
    FIELD_IDS.forEach(function (id) {
      const handler = function () {
        // marks limits may have changed, so repaint every card
        students.forEach(function (s, i) {
          paintCard(i);
        });
        afterEdit();
      };
      $(id).addEventListener("input", handler);
      $(id).addEventListener("change", handler);
    });
    document.querySelectorAll("[data-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        setMode(button.dataset.mode);
      });
    });
    document.querySelectorAll("[data-tab-btn]").forEach(function (button) {
      button.addEventListener("click", function () {
        setTab(button.dataset.tabBtn);
      });
    });
    $("toMarks").addEventListener("click", function () {
      setTab("marks");
    });
    $("toSheet").addEventListener("click", function () {
      setTab("sheet");
    });

    const list = $("students");
    list.addEventListener("input", function (event) {
      const target = event.target;
      if (!target.dataset.f) return;
      const i = Number(target.dataset.i);
      students[i][target.dataset.f] = target.value;
      paintCard(i);
      afterEdit();
    });
    list.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" || !event.target.dataset.f) return;
      event.preventDefault();
      focusNext(event.target);
    });
    list.addEventListener("focusin", function (event) {
      const target = event.target;
      if (target.classList.contains("mark")) {
        setTimeout(function () {
          target.select();
        }, 0);
      }
    });
    list.addEventListener("click", function (event) {
      const toggle = event.target.closest("[data-ab]");
      if (toggle) {
        toggleAbsent(Number(toggle.dataset.ab));
        return;
      }
      const del = event.target.closest("[data-del]");
      if (del) removeStudent(Number(del.dataset.del));
    });

    $("addStudent").addEventListener("click", addStudent);
    $("addTop").addEventListener("click", addStudent);
    $("issues").addEventListener("click", function () {
      const index = students.findIndex(function (s) {
        return fieldsInUse().some(function (f) {
          return fieldState(s, f) !== "";
        });
      });
      const card = document.querySelector('[data-card="' + index + '"]');
      if (card) card.scrollIntoView({ block: "center" });
    });
    document.querySelectorAll("[data-sort]").forEach(function (button) {
      button.addEventListener("click", function () {
        sortStudents(button.dataset.sort);
      });
    });
    $("undoSort").addEventListener("click", undoSort);
    $("clearStudents").addEventListener("click", function () {
      if (students.length && confirm("Remove all " + students.length + " students?")) {
        students = [];
        beforeSort = null;
        $("undoSort").hidden = true;
        renderStudents();
        afterEdit();
      }
    });
    $("fileInput").addEventListener("change", async function (event) {
      const file = event.target.files[0];
      event.target.value = "";
      if (!file) return;
      try {
        const name = file.name.toLowerCase();
        if (name.endsWith(".csv") || name.endsWith(".txt")) {
          importRows(parseCSV(await file.text()));
        } else {
          const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
          const sheet = book.Sheets[book.SheetNames[0]];
          importRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }));
        }
      } catch (error) {
        console.error(error);
        toast("Could not read that file. Try saving it as CSV.");
      }
    });
    $("importPaste").addEventListener("click", function () {
      importRows(parseCSV($("csvPaste").value));
    });
    $("loadSample").addEventListener("click", loadSample);
    $("exportCsv").addEventListener("click", function () {
      if (!students.length) {
        toast("Nothing to export yet.");
        return;
      }
      download(fileName("Marks", "csv"), new Blob(["﻿" + csvText()], { type: "text/csv;charset=utf-8" }));
    });
    $("downloadTemplate").addEventListener("click", function () {
      const text =
        mode === "split"
          ? "Name,External,Internal\r\nStudent One,75,20\r\nStudent Two,Ab,Ab\r\n"
          : "Name,Marks\r\nStudent One,95\r\nStudent Two,Ab\r\n";
      download("CNR-marks-template.csv", new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    });
    $("downloadPng").addEventListener("click", savePicture);
    $("sharePng").addEventListener("click", sharePicture);
    $("printSheet").addEventListener("click", printSheet);

    // hide the bottom bar only while the on-screen keyboard is really open.
    // (On Android the box stays focused after the keyboard is dismissed, so
    // focus alone cannot be used.)
    document.addEventListener("focusin", updateTyping);
    document.addEventListener("focusout", function () {
      setTimeout(updateTyping, 80);
    });
    window.addEventListener("resize", updateTyping);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", updateTyping);

    if (window.ResizeObserver) new ResizeObserver(scheduleSheet).observe($("stage"));
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") saveNow();
    });
    window.addEventListener("pagehide", saveNow);
    window.addEventListener("beforeprint", beginPrint);
    window.addEventListener("afterprint", endPrint);
  }

  /* ═══════════════ Start ═══════════════ */
  document.querySelectorAll("img[data-art]").forEach(function (img) {
    img.src = window.ART[img.dataset.art].src;
  });
  const hadData = load();
  wire();
  renderStudents();
  updateSummary();
  setTab(hadData ? "marks" : "details");
  $("sharePng").hidden = !canShareFiles();

  // draw again once fonts and artwork are ready, so text is measured correctly
  const artwork = Array.from(document.querySelectorAll("img[data-art]")).map(function (img) {
    return img.decode ? img.decode().catch(function () {}) : Promise.resolve();
  });
  Promise.all(artwork)
    .then(function () {
      return document.fonts ? document.fonts.load('400 30px "Patrick Hand"') : null;
    })
    .then(function () {
      return document.fonts ? document.fonts.load('400 30px "Kalam"') : null;
    })
    .then(function () {
      return document.fonts ? document.fonts.load('400 30px "Sheet Digits"', "0123456789") : null;
    })
    .then(function () {
      renderStudents();
      refreshSheet();
    });

  window.__cnr = {
    get students() {
      return students;
    },
    get mode() {
      return mode;
    },
    refreshSheet: refreshSheet,
    setTab: setTab,
  };
})();
