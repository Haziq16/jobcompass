export function aiEnabled() {
  return (
    process.env.ENABLE_AI === "true" || process.env.JOBCOMPASS_TEST === "true"
  );
}
