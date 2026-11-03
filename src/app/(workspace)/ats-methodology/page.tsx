import Link from "next/link";
import result from "@/lib/ats-benchmark-result.json";
export default function AtsMethodology() {
  return (
    <section className="job-workspace ats-methodology">
      <header className="job-workspace-heading">
        <div>
          <h1>ATS check methodology</h1>
          <p>Measured development checks, with the limits kept visible.</p>
        </div>
        <Link href="/assistant">Open AI Studio</Link>
      </header>
      <h2>What is checked</h2>
      <p>
        JobCompass extracts candidate fields with source references, checks
        document risks, separates job requirements and reads exported Word files
        back to compare them with saved wording. The checks run without a model
        or a paid provider request.
      </p>
      <h2>Synthetic development benchmark</h2>
      <p>
        Engine {result.version}. {result.fixtures} fictional PDF/DOCX fixtures;{" "}
        {result.passed} of {result.scenarios} diagnostic, export-integrity and
        requirement scenarios passed.
      </p>
      <table>
        <caption>
          Exact candidate fields: name, email, job title, employer and degree
        </caption>
        <thead>
          <tr>
            <th>Measurement</th>
            <th>Observed</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Correct field predictions</td>
            <td>{result.fields.truePositive}</td>
          </tr>
          <tr>
            <td>Extra field predictions</td>
            <td>{result.fields.falsePositive}</td>
          </tr>
          <tr>
            <td>Missed expected fields</td>
            <td>{result.fields.falseNegative}</td>
          </tr>
          <tr>
            <td>Precision on these fixtures</td>
            <td>{(result.fields.precision * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Recall on these fixtures</td>
            <td>{(result.fields.recall * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Expected risk checks</td>
            <td>
              {result.diagnostics.passed}/{result.diagnostics.total}
            </td>
          </tr>
        </tbody>
      </table>
      <h2>What the figures do not prove</h2>
      <p>{result.limitations}</p>
      <p>
        Expected fields are authored separately from the parser. The corpus
        includes clean and multi-page documents, columns, right-aligned dates,
        tables, header contacts, text boxes, hidden/deleted text, missing
        fields, Unicode, alternative headings and layouts the parser may not
        understand. Export tests deliberately lose, reorder and add text.
        Negative and learning-only skill statements cannot establish experience;
        years and personal eligibility require confirmation.
      </p>
      <h3>Field extraction gaps observed in this corpus</h3>
      <ul>
        {result.cases
          .filter((item) => "exactFields" in item && !item.exactFields)
          .map((item) => (
            <li key={item.id}>{item.id.replaceAll("-", " ")}</li>
          ))}
      </ul>
      <p>
        Field candidates never overwrite your confirmed profile. A readable file
        does not establish job eligibility, and a keyword match does not prove a
        qualification. File verification does not simulate every employer ATS.
      </p>
    </section>
  );
}
