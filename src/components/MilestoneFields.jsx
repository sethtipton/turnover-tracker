export function MilestoneFields({ date = "", onChange }) {
  return <div className="milestone-fields">
    <label className="form-field"><span>Target date <span className="optional-label">optional</span></span><input name="milestone_date" type="date" value={date || ""} onChange={(event) => onChange({ milestone_date: event.target.value })} /></label>
  </div>;
}
