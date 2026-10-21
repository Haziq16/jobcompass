// Leave a minute inside the route's 300-second hosting limit for reservation,
// validation and saving the result. Never expire a review while it can still run.
export const REVIEW_PROVIDER_TIMEOUT_MS = 240_000;
export const REVIEW_INTERRUPTED_AFTER_MS = 330_000;
