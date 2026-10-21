"use client";
import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

export function ReviewWaiting() {
  const [started] = useState(Date.now);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [started]);
  return (
    <section className="ai-waiting" aria-label="Review progress">
      <div className="ai-waiting-top">
        <LoaderCircle size={22} className="ai-spinner" />
        <div>
          <h2>Reviewing your application</h2>
          <p>
            Your request has been sent. Waiting for your provider’s response.
          </p>
        </div>
        <span aria-label="Time elapsed">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </span>
      </div>
      <p role="status">
        {seconds < 45
          ? "The model is comparing the job requirements with your CV. You can read your free text checks below while you wait."
          : "Still waiting for your provider. Reasoning models can take several minutes. Provider time is limited to four minutes; saving the result can take a little longer."}
      </p>
      <small>
        Keep this tab open. No automatic retries or additional paid requests.
      </small>
    </section>
  );
}
