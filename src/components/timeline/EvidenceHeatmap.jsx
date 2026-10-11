import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const getEvidenceDate = (item) => {
  const value = item?.timestamp ?? item?.customDate ?? item?.date;
  if (value == null || value === "") return null;
  const date = new Date(typeof value === "number" ? value : value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getIntensity = (count) => {
  if (count === 0) return 0;
  if (count >= 8) return 4;
  if (count >= 4) return 3;
  if (count >= 2) return 2;
  return 1;
};

export default function EvidenceHeatmap({ evidence = [], availableYears = [] }) {
  const currentYear = new Date().getFullYear();
  const evidenceYears = availableYears.length
    ? availableYears
    : evidence.map(getEvidenceDate).filter(Boolean).map((date) => date.getFullYear());
  const yearOptions = useMemo(
    () => [...new Set([...evidenceYears, currentYear])].sort((a, b) => a - b),
    [evidenceYears, currentYear],
  );
  const defaultYear = evidenceYears.length
    ? Math.max(...evidenceYears)
    : currentYear;
  const [selectedYear, setSelectedYear] = useState(null);
  const year = yearOptions.includes(selectedYear) ? selectedYear : defaultYear;
  const yearIndex = yearOptions.indexOf(year);

  const countsByDay = useMemo(() => {
    const counts = new Map();
    evidence.forEach((item) => {
      const date = getEvidenceDate(item);
      if (!date || date.getFullYear() !== year) return;
      const key = dateKey(date);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [evidence, year]);

  const calendar = useMemo(() => {
    const firstOfYear = new Date(year, 0, 1);
    const gridStart = new Date(year, 0, 1 - firstOfYear.getDay());
    const lastOfYear = new Date(year, 11, 31);
    const gridEnd = new Date(
      year,
      11,
      31 + (6 - lastOfYear.getDay()),
    );
    const dayCount = Math.round((gridEnd - gridStart) / 86_400_000) + 1;
    const weekCount = Math.ceil(dayCount / 7);
    const days = Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return { date, week: Math.floor(index / 7) };
    });
    const monthLabels = Array.from({ length: 12 }, (_, month) => {
      const date = new Date(year, month, 1);
      const dayOffset =
        (Date.UTC(year, month, 1) -
          Date.UTC(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate())) /
        86_400_000;
      return {
        label: date.toLocaleDateString(undefined, { month: "short" }),
        week: Math.floor(dayOffset / 7),
      };
    });

    return { days, monthLabels, weekCount };
  }, [year]);

  const yearTotal = useMemo(
    () => [...countsByDay.values()].reduce((total, count) => total + count, 0),
    [countsByDay],
  );

  return (
    <section className="cv-evidence-heatmap" aria-label="Evidence activity heatmap">
      <header className="cv-heatmap-header">
        <div>
          <h2 className="cv-heatmap-title">Evidence activity</h2>
          <p className="cv-heatmap-summary">
            {yearTotal.toLocaleString()} {yearTotal === 1 ? "evidence" : "evidences"} in {year}
          </p>
        </div>
        <div className="cv-heatmap-year-controls" role="group" aria-label="Heatmap year">
          <button
            type="button"
            onClick={() => setSelectedYear(yearOptions[yearIndex - 1])}
            disabled={yearIndex <= 0}
            aria-label="Previous year"
            title="Previous year"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span aria-live="polite">{year}</span>
          <button
            type="button"
            onClick={() => setSelectedYear(yearOptions[yearIndex + 1])}
            disabled={yearIndex < 0 || yearIndex >= yearOptions.length - 1}
            aria-label="Next year"
            title="Next year"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="cv-heatmap-scroll">
        <div
          className="cv-heatmap-grid"
          style={{
            gridTemplateColumns: `2.25rem repeat(${calendar.weekCount}, var(--cv-heatmap-cell-size))`,
          }}
        >
          {calendar.monthLabels.map((month) => (
            <span
              key={month.label}
              className="cv-heatmap-month"
              style={{ gridColumn: month.week + 2, gridRow: 1 }}
            >
              {month.label}
            </span>
          ))}
          {["Sun", "", "Tue", "", "Thu", "", "Sat"].map((day, index) => (
            <span
              key={index}
              className="cv-heatmap-weekday"
              style={{ gridColumn: 1, gridRow: index + 2 }}
            >
              {day}
            </span>
          ))}
          {calendar.days.map(({ date, week }) => {
            const inYear = date.getFullYear() === year;
            const count = inYear ? countsByDay.get(dateKey(date)) || 0 : 0;
            const label = date.toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            });
            const description = `${count} ${count === 1 ? "evidence" : "evidences"} on ${label}`;

            return inYear ? (
              <button
                key={dateKey(date)}
                type="button"
                className="cv-heatmap-day"
                data-level={getIntensity(count)}
                title={description}
                aria-label={description}
                style={{
                  gridColumn: week + 2,
                  gridRow: date.getDay() + 2,
                }}
              />
            ) : (
              <span
                key={dateKey(date)}
                className="cv-heatmap-day cv-heatmap-day-outside"
                aria-hidden="true"
                style={{
                  gridColumn: week + 2,
                  gridRow: date.getDay() + 2,
                }}
              />
            );
          })}
        </div>
      </div>

      <footer className="cv-heatmap-legend" aria-label="Evidence count legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className="cv-heatmap-day cv-heatmap-legend-cell"
            data-level={level}
            aria-hidden="true"
          />
        ))}
        <span>More</span>
      </footer>
    </section>
  );
}
