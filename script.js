"use strict";

const STORAGE_KEY = "sales-report-v1";
const UNITS = [
  { id: "astana1", name: "Астана1", group: "internal" },
  { id: "astana2", name: "Астана2", group: "internal" },
  { id: "astana3", name: "Астана3", group: "internal" },
  { id: "shymkent", name: "Шымкент", group: "internal" },
  { id: "almaty", name: "Алматы", group: "internal" },
  { id: "external", name: "Внешний отдел продаж", group: "external" }
];
const LEADERS = [
  { id: "north", units: ["astana1", "astana2", "astana3"], rate: 4 },
  { id: "south", units: ["shymkent", "almaty"], rate: 4 },
  { id: "senior", units: ["astana1", "astana2", "astana3", "shymkent", "almaty"], rate: 2 }
];
const UNIT_IDS = new Set(UNITS.map((unit) => unit.id));
const yearInput = document.getElementById("year");
const monthSelect = document.getElementById("month");
const statusElement = document.getElementById("status");
const today = new Date();
let selectedYear = today.getFullYear();
let selectedMonth = today.getMonth() + 1;
let entries = Object.create(null);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateBackup(value) {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.entries)) {
    throw new Error("Неверный формат резервной копии.");
  }

  const clean = Object.create(null);
  for (const [period, units] of Object.entries(value.entries)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !isRecord(units)) {
      throw new Error("В файле есть неверный период.");
    }
    clean[period] = Object.create(null);
    for (const [unitId, amounts] of Object.entries(units)) {
      if (!UNIT_IDS.has(unitId) || !isRecord(amounts)) {
        throw new Error("В файле есть неизвестный отдел или команда.");
      }
      clean[period][unitId] = Object.create(null);
      for (const [field, amount] of Object.entries(amounts)) {
        if ((!["plan", "actual"].includes(field) && !(unitId === "external" && field === "expense")) ||
            !Number.isSafeInteger(amount) || amount < 0) {
          throw new Error("В файле есть неверная сумма.");
        }
        clean[period][unitId][field] = amount;
      }
    }
  }
  return clean;
}

function setStatus(message, error = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

function money(amount) {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return amount.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    .replace(/[\u00a0\u202f]/g, " ") + " ₸";
}

function inputAmount(amount) {
  return amount === undefined ? "" : money(amount).replace(" ₸", "");
}

function percent(plan, actual) {
  if (plan === undefined || actual === undefined || plan === 0) return "—";
  const value = (actual / plan) * 100;
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + "%";
}

function teamPremium(actual) {
  if (actual === undefined) return undefined;
  return actual * (actual > 10000000 ? 20 : 15) / 100;
}

function leaderSummary(leader) {
  const months = monthsForPeriod("quarter");
  let base = 0;
  let filled = 0;
  for (const unitId of leader.units) {
    for (const month of months) {
      const actual = amountsFor(selectedYear, month, unitId).actual;
      if (actual !== undefined) {
        base += actual;
        filled++;
      }
    }
  }
  return {
    base: filled ? base : undefined,
    complete: filled === leader.units.length * months.length
  };
}

function renderLeaders() {
  document.getElementById("leaders-period").textContent = `${periodTitle("quarter")}, ${selectedYear}`;
  for (const leader of LEADERS) {
    const card = document.querySelector(`[data-leader="${leader.id}"]`);
    const result = leaderSummary(leader);
    card.querySelector("[data-value=base]").textContent = result.base === undefined ? "—" : money(result.base);
    card.querySelector("[data-value=premium]").textContent = result.base === undefined ? "—" : money(result.base * leader.rate / 100);
    card.querySelector(".leader-incomplete").hidden = result.complete;
  }
}

function key(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function amountsFor(year, month, unitId) {
  return entries[key(year, month)]?.[unitId] || {};
}

function monthsForPeriod(kind) {
  if (kind === "month") return [selectedMonth];
  if (kind === "year") return Array.from({ length: 12 }, (_, index) => index + 1);
  const first = Math.floor((selectedMonth - 1) / 3) * 3 + 1;
  return [first, first + 1, first + 2];
}

function summary(unitId, kind) {
  const months = monthsForPeriod(kind);
  let plan = 0;
  let actual = 0;
  let expense = 0;
  let planCount = 0;
  let actualCount = 0;
  let expenseCount = 0;
  let completeCount = 0;

  for (const month of months) {
    const item = amountsFor(selectedYear, month, unitId);
    if (item.plan !== undefined) { plan += item.plan; planCount++; }
    if (item.actual !== undefined) { actual += item.actual; actualCount++; }
    if (unitId === "external" && item.expense !== undefined) { expense += item.expense; expenseCount++; }
    if (item.plan !== undefined && item.actual !== undefined) completeCount++;
  }
  return {
    plan: planCount ? plan : undefined,
    actual: actualCount ? actual : undefined,
    expense: expenseCount ? expense : undefined,
    expenseComplete: expenseCount === months.length,
    complete: completeCount === months.length
  };
}

function periodTitle(kind) {
  if (kind === "month") return "Месяц";
  if (kind === "year") return "Год";
  return `${Math.ceil(selectedMonth / 3)} квартал`;
}

function renderSummary(card, unitId) {
  for (const kind of ["month", "quarter", "year"]) {
    const result = summary(unitId, kind);
    const section = card.querySelector(`[data-period="${kind}"]`);
    section.querySelector("h4").textContent = periodTitle(kind);
    section.querySelector("[data-value=plan]").textContent = result.plan === undefined ? "—" : money(result.plan);
    section.querySelector("[data-value=actual]").textContent = result.actual === undefined ? "—" : money(result.actual);
    if (unitId === "external" && kind === "quarter") {
      section.querySelector("[data-value=expense]").textContent = result.expense === undefined ? "—" : money(result.expense);
      section.querySelector(".expense-incomplete").hidden = result.expenseComplete;
    } else if (unitId !== "external" && kind === "quarter") {
      const premium = teamPremium(result.actual);
      section.querySelector("[data-value=premium]").textContent = premium === undefined ? "—" : money(premium);
    }
    section.querySelector("[data-value=percent]").textContent = percent(result.plan, result.actual);
    const incomplete = section.querySelector(".period-incomplete");
    incomplete.hidden = result.complete;
    incomplete.textContent = kind === "month" ? "Не все поля заполнены" : "Не все месяцы заполнены";
  }

  const anomaly = card.querySelector(".anomaly");
  const current = amountsFor(selectedYear, selectedMonth, unitId).actual;
  const previousDate = new Date(selectedYear, selectedMonth - 2, 1);
  const previous = amountsFor(previousDate.getFullYear(), previousDate.getMonth() + 1, unitId).actual;
  anomaly.hidden = true;
  if (current !== undefined && previous !== undefined) {
    let explanation = "";
    if (previous === 0 && current > 0) {
      explanation = `Резкий рост факта: было ${money(previous)}, стало ${money(current)}.`;
    } else if (previous > 0 && current >= previous * 2) {
      explanation = `Резкий рост факта: было ${money(previous)}, стало ${money(current)} (в 2 раза или больше).`;
    } else if (previous > 0 && current <= previous / 2) {
      explanation = `Резкий спад факта: было ${money(previous)}, стало ${money(current)} (в 2 раза или больше).`;
    }
    if (explanation) {
      anomaly.textContent = `Аномалия: ${explanation}`;
      anomaly.hidden = false;
    }
  }
}

function periodMarkup(kind, external) {
  return `<div class="period" data-period="${kind}">
    <h4></h4>
    <p>План: <strong data-value="plan">—</strong></p>
    <p>Факт: <strong data-value="actual">—</strong></p>
    ${external && kind === "quarter" ? '<p>Расход: <strong data-value="expense">—</strong></p><p class="incomplete expense-incomplete">Не все расходы заполнены</p>' : ""}
    ${!external && kind === "quarter" ? '<p class="premium">Премия: <strong data-value="premium">—</strong></p>' : ""}
    <p class="percent">Выполнение: <span data-value="percent">—</span></p>
    <p class="incomplete period-incomplete"></p>
  </div>`;
}

function createCard(unit) {
  const card = document.createElement("article");
  card.className = unit.group === "internal" ? "card team-card" : "card";
  card.dataset.unit = unit.id;
  card.innerHTML = `<h3>${unit.name}</h3>
    <div class="card-layout">
      <div class="entry-fields">
        <label for="${unit.id}-plan">План за месяц
          <span class="money-input"><input id="${unit.id}-plan" data-field="plan" type="text" inputmode="numeric" autocomplete="off" placeholder="0" aria-describedby="${unit.id}-plan-error"><span>₸</span></span>
          <span class="field-error" id="${unit.id}-plan-error"></span>
        </label>
        <label for="${unit.id}-actual">Факт за месяц
          <span class="money-input"><input id="${unit.id}-actual" data-field="actual" type="text" inputmode="numeric" autocomplete="off" placeholder="0" aria-describedby="${unit.id}-actual-error"><span>₸</span></span>
          <span class="field-error" id="${unit.id}-actual-error"></span>
        </label>
        ${unit.group === "external" ? `<label for="${unit.id}-expense">Расход за месяц
          <span class="money-input"><input id="${unit.id}-expense" data-field="expense" type="text" inputmode="numeric" autocomplete="off" placeholder="0" aria-describedby="${unit.id}-expense-error"><span>₸</span></span>
          <span class="field-error" id="${unit.id}-expense-error"></span>
        </label>` : ""}
      </div>
      <div class="periods">${["month", "quarter", "year"].map((kind) => periodMarkup(kind, unit.group === "external")).join("")}</div>
    </div>
    <p class="anomaly" role="alert" hidden></p>`;
  card.querySelectorAll("input[data-field]").forEach((input) => {
    input.addEventListener("input", () => updateAmount(unit.id, input));
    input.addEventListener("blur", () => {
      if (input.getAttribute("aria-invalid") !== "true") {
        input.value = inputAmount(amountsFor(selectedYear, selectedMonth, unit.id)[input.dataset.field]);
      }
    });
  });
  return card;
}

function parseAmount(raw) {
  const compact = raw.replace(/[\s\u00a0\u202f]/g, "");
  if (compact === "") return undefined;
  if (!/^\d+$/.test(compact)) throw new Error("Введите целую неотрицательную сумму.");
  const value = Number(compact);
  if (!Number.isSafeInteger(value)) throw new Error("Сумма слишком велика.");
  return value;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, entries }));
    setStatus("Сохранено в браузере.");
  } catch {
    setStatus("Не удалось сохранить данные в браузере. Выгрузите резервную копию.", true);
  }
}

function updateAmount(unitId, input) {
  const error = document.getElementById(`${unitId}-${input.dataset.field}-error`);
  let value;
  try {
    value = parseAmount(input.value);
    error.textContent = "";
    input.removeAttribute("aria-invalid");
  } catch (cause) {
    error.textContent = cause.message;
    input.setAttribute("aria-invalid", "true");
    setStatus("Исправьте неверную сумму.", true);
    return;
  }

  const period = key(selectedYear, selectedMonth);
  if (!entries[period]) entries[period] = Object.create(null);
  if (!entries[period][unitId]) entries[period][unitId] = Object.create(null);
  if (value === undefined) delete entries[period][unitId][input.dataset.field];
  else entries[period][unitId][input.dataset.field] = value;
  if (Object.keys(entries[period][unitId]).length === 0) delete entries[period][unitId];
  if (Object.keys(entries[period]).length === 0) delete entries[period];
  persist();
  renderSummary(input.closest(".card"), unitId);
  if (unitId !== "external" && input.dataset.field === "actual") renderLeaders();
}

function render() {
  for (const unit of UNITS) {
    const card = document.querySelector(`[data-unit="${unit.id}"]`);
    const item = amountsFor(selectedYear, selectedMonth, unit.id);
    for (const field of unit.group === "external" ? ["plan", "actual", "expense"] : ["plan", "actual"]) {
      const input = card.querySelector(`[data-field="${field}"]`);
      input.value = inputAmount(item[field]);
      input.removeAttribute("aria-invalid");
      document.getElementById(`${unit.id}-${field}-error`).textContent = "";
    }
    renderSummary(card, unit.id);
  }
  renderLeaders();
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    entries = validateBackup(JSON.parse(raw));
  } catch {
    setStatus("Не удалось прочитать сохранённые данные. Загрузите резервную копию.", true);
  }
}

for (const unit of UNITS) {
  const target = document.getElementById(unit.group === "internal" ? "internal-cards" : "external-cards");
  target.appendChild(createCard(unit));
}
yearInput.value = selectedYear;
monthSelect.value = selectedMonth;
loadStored();
render();

yearInput.addEventListener("change", () => {
  const year = Number(yearInput.value);
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    setStatus("Введите год от 2000 до 9999.", true);
    yearInput.value = selectedYear;
    return;
  }
  selectedYear = year;
  setStatus("");
  render();
});

monthSelect.addEventListener("change", () => {
  selectedMonth = Number(monthSelect.value);
  setStatus("");
  render();
});

document.getElementById("export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ version: 1, entries }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `prodazhi-${selectedYear}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("Резервная копия выгружена.");
});

const importFile = document.getElementById("import-file");
document.getElementById("import-button").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  if (!file) return;
  try {
    const imported = validateBackup(JSON.parse(await file.text()));
    if (confirm("Заменить текущие данные данными из файла?")) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, entries: imported }));
      entries = imported;
      render();
      setStatus("Данные загружены из файла.");
    }
  } catch (cause) {
    setStatus(`Не удалось загрузить данные: ${cause.message}`, true);
  }
  importFile.value = "";
});
