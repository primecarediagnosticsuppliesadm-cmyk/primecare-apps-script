import { showsRecordedCue } from "@/reviews/reviewPresentation.js";

function optionRows(options) {
  if (!Array.isArray(options)) return [];
  return options
    .map((option) => {
      if (option && typeof option === "object") {
        return { value: String(option.value ?? ""), label: String(option.label || option.value || "") };
      }
      return { value: String(option ?? ""), label: String(option ?? "") };
    })
    .filter((option) => option.value);
}

function Choice({ checked, label, onChange, type, name, disabled }) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-base">
      <input
        type={type}
        name={name}
        className="h-5 w-5 shrink-0"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span>{label}</span>
    </label>
  );
}

export default function ReviewQuestionField({
  question,
  value,
  disabled = false,
  labs = [],
  onChange,
}) {
  const options = optionRows(question.options_json);
  const answer = value || {};
  const recorded = showsRecordedCue(question.question_text);

  const body = (() => {
    switch (question.response_type) {
      case "TEXT":
        return (
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
            value={answer.text || ""}
            disabled={disabled}
            aria-label={question.question_key}
            onChange={(event) => onChange({ text: event.target.value })}
          />
        );
      case "LONG_TEXT":
        return (
          <textarea
            className="min-h-32 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
            value={answer.text || ""}
            disabled={disabled}
            aria-label={question.question_key}
            onChange={(event) => onChange({ text: event.target.value })}
          />
        );
      case "YES_NO":
        return (
          <div className="grid grid-cols-2 gap-2">
            {[
              [true, "Yes"],
              [false, "No"],
            ].map(([flag, label]) => (
              <button
                key={label}
                type="button"
                disabled={disabled}
                aria-pressed={answer.value === flag}
                className={`min-h-11 rounded-lg border px-3 text-base ${
                  answer.value === flag ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"
                }`}
                onClick={() => onChange({ value: flag })}
              >
                {label}
              </button>
            ))}
          </div>
        );
      case "SINGLE_SELECT":
        return (
          <div className="space-y-2">
            {options.map((option) => (
              <Choice
                key={option.value}
                type="radio"
                name={question.id}
                label={option.label}
                disabled={disabled}
                checked={answer.value === option.value}
                onChange={() => onChange({ value: option.value })}
              />
            ))}
          </div>
        );
      case "MULTI_SELECT": {
        const selected = Array.isArray(answer.values) ? answer.values : [];
        return (
          <div className="space-y-2">
            {options.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <Choice
                  key={option.value}
                  type="checkbox"
                  label={option.label}
                  disabled={disabled}
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? selected.filter((item) => item !== option.value)
                      : [...selected, option.value];
                    onChange({ values: next });
                  }}
                />
              );
            })}
          </div>
        );
      }
      case "NUMBER":
        return (
          <input
            type="number"
            inputMode="decimal"
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
            value={typeof answer.value === "number" ? String(answer.value) : ""}
            disabled={disabled}
            aria-label={question.question_key}
            onChange={(event) => {
              const raw = event.target.value;
              onChange(raw === "" ? {} : { value: Number(raw) });
            }}
          />
        );
      case "RATING": {
        const scale = options.length
          ? options
          : [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));
        return (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={question.question_key}>
            {scale.map((option) => {
              const numeric = Number(option.value);
              const selected = answer.value === numeric;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  className={`min-h-11 min-w-11 rounded-lg border px-3 text-base ${
                    selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"
                  }`}
                  onClick={() => onChange({ value: numeric })}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        );
      }
      case "DATE":
        return (
          <input
            type="date"
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
            value={answer.value || ""}
            disabled={disabled}
            aria-label={question.question_key}
            onChange={(event) => onChange({ value: event.target.value })}
          />
        );
      case "LAB_SELECT":
        return (
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
            value={answer.lab_id || ""}
            disabled={disabled}
            aria-label={question.question_key}
            onChange={(event) => {
              const lab = labs.find((item) => item.labId === event.target.value);
              onChange(lab ? { lab_id: lab.labId, lab_name: lab.labName } : {});
            }}
          >
            <option value="">Select a laboratory</option>
            {labs.map((lab) => (
              <option key={lab.labId} value={lab.labId}>
                {lab.labName}
              </option>
            ))}
          </select>
        );
      case "MULTI_LAB_SELECT": {
        const selected = Array.isArray(answer.lab_ids) ? answer.lab_ids : [];
        return (
          <div className="space-y-2">
            {labs.length === 0 ? (
              <p className="text-sm text-slate-600">
                {disabled
                  ? "Laboratory choices are shown to the agent from the laboratories they can already see."
                  : "No laboratories are available for your account."}
              </p>
            ) : null}
            {labs.map((lab) => {
              const checked = selected.includes(lab.labId);
              return (
                <Choice
                  key={lab.labId}
                  type="checkbox"
                  label={lab.labName}
                  disabled={disabled}
                  checked={checked}
                  onChange={() => {
                    const nextIds = checked
                      ? selected.filter((id) => id !== lab.labId)
                      : [...selected, lab.labId];
                    const labsChosen = labs
                      .filter((item) => nextIds.includes(item.labId))
                      .map((item) => ({ lab_id: item.labId, lab_name: item.labName }));
                    onChange({ lab_ids: nextIds, labs: labsChosen });
                  }}
                />
              );
            })}
          </div>
        );
      }
      default:
        return <p className="text-sm text-slate-600">This question type cannot be shown.</p>;
    }
  })();

  return (
    <div className="space-y-2">
      {recorded ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recorded in PrimeCare</p>
      ) : null}
    <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" disabled={false}>
      <legend className="text-base font-medium leading-6 text-slate-900">{question.question_text}</legend>
      {question.required ? <p className="text-sm text-slate-600">Required</p> : <p className="text-sm text-slate-500">Optional</p>}
      {body}
    </fieldset>
    </div>
  );
}
